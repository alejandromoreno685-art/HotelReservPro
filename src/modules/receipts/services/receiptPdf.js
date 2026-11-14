function pdfText(value) {
  const normalized = String(value).replace(/[^\u0000-\u00ff]/g, '?');
  const bytes = Buffer.from(normalized, 'latin1');
  return bytes.toString('hex').toUpperCase();
}

function wrap(value, limit = 76) {
  const words = String(value).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > limit) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function formatAmount(value) {
  return `$ ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(BigInt(value))} COP`;
}

function receiptLines(receipt) {
  const lines = [
    { text: 'COMPROBANTE INTERNO', bold: true, size: 15 },
    { text: 'No es factura electrónica', size: 10 },
    { text: '' },
    { text: `Comprobante: ${receipt.receiptId}`, bold: true },
    { text: `Reserva: ${receipt.reservationId}` },
    { text: `Estado de la reserva: ${receipt.status}` },
    { text: `Huésped: ${receipt.guestName} (${receipt.documentType} ${receipt.documentNumber})` },
    { text: `Habitación: ${receipt.roomNumber} - ${receipt.roomType}` },
    { text: `Entrada: ${receipt.checkIn}    Salida: ${receipt.checkOut}    Noches: ${receipt.nights}` },
    { text: '' },
    { text: 'DETALLE', bold: true },
    { text: `Alojamiento: ${receipt.nights} noches x ${formatAmount(receipt.ratePerNight)} = ${formatAmount(receipt.accommodation)}` },
    ...receipt.charges.map((item) => ({
      text: `Consumo: ${item.description} - ${formatAmount(item.amount)}`
    })),
    ...(!receipt.charges.length ? [{ text: 'Consumos: $ 0 COP' }] : []),
    { text: `Total consumos: ${formatAmount(receipt.chargeTotal)}` },
    { text: '' },
    { text: 'ANTICIPOS Y SALDO', bold: true },
    ...receipt.payments.map((item) => ({
      text: `Anticipo: ${item.description} - ${formatAmount(item.amount)}`
    })),
    ...(!receipt.payments.length ? [{ text: 'Anticipos: $ 0 COP' }] : []),
    { text: `Total alojamiento: ${formatAmount(receipt.accommodation)}` },
    { text: `Total consumos: ${formatAmount(receipt.chargeTotal)}` },
    { text: `TOTAL: ${formatAmount(receipt.total)}`, bold: true, size: 13 },
    { text: `Anticipos: ${formatAmount(receipt.paymentTotal)}` },
    { text: `SALDO: ${formatAmount(receipt.balance)}`, bold: true, size: 13 },
    { text: '' },
    { text: 'Reimpresión informativa: no registra cargos ni pagos adicionales.', size: 9 }
  ];
  return lines.flatMap((line) => wrap(line.text).map((text) => ({ ...line, text })));
}

function makePageContent(lines, pageNumber, pageCount) {
  const commands = [
    '0.063 0.169 0.275 rg 0 770 595 72 re f',
    // Texto blanco sobre la franja; luego se restablece el color del cuerpo.
    '1 1 1 rg',
    'BT /F2 22 Tf 42 808 Td <486F74656C526573657276652050726F> Tj ET',
    'BT /F1 10 Tf 42 786 Td <436F6D70726F62616E746520646520657374616469613B206D6F6E65646120434F50> Tj ET',
    '0.063 0.169 0.275 rg'
  ];
  let y = 742;
  for (const line of lines) {
    if (!line.text) {
      y -= 8;
      continue;
    }
    commands.push(
      `BT /${line.bold ? 'F2' : 'F1'} ${line.size || 10} Tf 42 ${y} Td <${pdfText(line.text)}> Tj ET`
    );
    y -= line.size && line.size > 12 ? 22 : 16;
  }
  commands.push(`BT /F1 9 Tf 510 30 Td <${pdfText(`${pageNumber}/${pageCount}`)}> Tj ET`);
  return commands.join('\n');
}

function buildPdf(receipt) {
  const lines = receiptLines(receipt);
  const maxLines = 39;
  const pages = [];
  for (let index = 0; index < lines.length; index += maxLines) {
    pages.push(lines.slice(index, index + maxLines));
  }

  const firstFontId = 3 + pages.length * 2;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`
  ];
  for (let index = 0; index < pages.length; index += 1) {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    const content = makePageContent(pages[index], index + 1, pages.length);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${firstFontId} 0 R /F2 ${firstFontId + 1} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    objects.push(`<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`);
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  const parts = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')];
  const offsets = [0];
  let offset = parts[0].length;
  objects.forEach((object, index) => {
    offsets.push(offset);
    const bytes = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, 'binary');
    parts.push(bytes);
    offset += bytes.length;
  });
  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const objectOffset of offsets.slice(1)) {
    xref += `${String(objectOffset).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(Buffer.from(xref, 'ascii'));
  return Buffer.concat(parts);
}

module.exports = { buildPdf };
