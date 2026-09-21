import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import * as XLSX from "xlsx";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const samplesDir = path.join(root, "samples");
await fsp.mkdir(samplesDir, { recursive: true });

const expected = {
  "01-clean-conventional.pdf": {
    vendorName: "Brightline Office Services",
    invoiceNumber: "BOS-2026-041",
    invoiceDate: "2026-08-14",
    currency: "USD",
    lineItems: [
      { description: "Ergonomic keyboard", quantity: "3", unitPrice: "89.50", lineTotal: "268.50" },
      {
        description: "USB-C docking station",
        quantity: "2",
        unitPrice: "179.00",
        lineTotal: "358.00",
      },
      { description: "Monitor arm", quantity: "4", unitPrice: "64.25", lineTotal: "257.00" },
    ],
    grandTotal: "883.50",
  },
  "02-alternate-layout.pdf": {
    vendorName: "Harbor and Pine Logistics",
    invoiceNumber: "HP-7729",
    invoiceDate: "2026-07-03",
    currency: "USD",
    lineItems: [
      {
        description: "Cold-chain crate rental",
        quantity: "12",
        unitPrice: "18.75",
        lineTotal: "225.00",
      },
      {
        description: "Priority regional freight",
        quantity: "1",
        unitPrice: "640.00",
        lineTotal: "640.00",
      },
      { description: "Fuel surcharge", quantity: "1", unitPrice: "76.35", lineTotal: "76.35" },
    ],
    grandTotal: "941.35",
  },
  "03-difficult-scan.pdf": {
    vendorName: "Cedar Ridge Maintenance",
    invoiceNumber: "CRM-518B",
    invoiceDate: "2026-06-22",
    currency: "USD",
    lineItems: [
      { description: "Valve inspection", quantity: "2", unitPrice: "145.00", lineTotal: "290.00" },
      {
        description: "Seal replacement kit",
        quantity: "3",
        unitPrice: "38.40",
        lineTotal: "115.20",
      },
      { description: "Emergency callout", quantity: "1", unitPrice: "210.00", lineTotal: "210.00" },
    ],
    grandTotal: "615.20",
    expectedStatus: "needs_review",
    uncertainHint: "invoiceNumber",
  },
  "04-offset-invoice.xlsx": {
    vendorName: "Meridian Lab Systems",
    invoiceNumber: "MLS-X2407",
    invoiceDate: "2026-05-09",
    currency: "USD",
    lineItems: [
      {
        description: "Optical calibration panel",
        quantity: "1",
        unitPrice: "480.00",
        lineTotal: "480.00",
      },
      {
        description: "Sterile sample trays",
        quantity: "6",
        unitPrice: "32.75",
        lineTotal: "196.50",
      },
      {
        description: "Temperature probe set",
        quantity: "2",
        unitPrice: "118.25",
        lineTotal: "236.50",
      },
    ],
    grandTotal: "913.00",
  },
};

function money(value) {
  return "$" + Number(value).toFixed(2);
}

async function writePdf(fileName, draw) {
  const filePath = path.join(samplesDir, fileName);
  await new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: "A4",
      margin: 48,
      info: { Title: fileName, Author: "Document Intelligence Agent sample generator" },
    });
    const stream = fs.createWriteStream(filePath);
    stream.on("finish", resolve);
    stream.on("error", reject);
    document.on("error", reject);
    document.pipe(stream);
    draw(document);
    document.end();
  });
}

await writePdf("01-clean-conventional.pdf", (doc) => {
  const data = expected["01-clean-conventional.pdf"];
  doc.fillColor("#173c34").font("Helvetica-Bold").fontSize(26).text("BRIGHTLINE", 48, 50);
  doc.fillColor("#53635f").font("Helvetica").fontSize(10).text("OFFICE SERVICES", 50, 82);
  doc
    .fillColor("#17201c")
    .font("Helvetica-Bold")
    .fontSize(30)
    .text("INVOICE", 390, 54, { align: "right" });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#53635f")
    .text("Invoice number", 350, 105)
    .fillColor("#17201c")
    .text(data.invoiceNumber, 450, 105, { align: "right" });
  doc
    .fillColor("#53635f")
    .text("Invoice date", 350, 123)
    .fillColor("#17201c")
    .text("14 Aug 2026", 450, 123, { align: "right" });
  doc.moveTo(48, 160).lineTo(547, 160).strokeColor("#bfd0c9").stroke();
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#17201c").text("BILL TO", 48, 182);
  doc
    .font("Helvetica")
    .fillColor("#53635f")
    .text("Juniper Field Research\n88 Halden Avenue\nPortland, OR 97205", 48, 201);
  const top = 280;
  const columns = [48, 330, 390, 466];
  const widths = [270, 50, 65, 81];
  doc.rect(48, top, 499, 28).fill("#173c34");
  ["Description", "Qty", "Unit price", "Amount"].forEach((label, index) =>
    doc
      .fillColor("#ffffff")
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(label, columns[index], top + 9, {
        width: widths[index],
        align: index === 0 ? "left" : "right",
      }),
  );
  data.lineItems.forEach((item, index) => {
    const y = top + 42 + index * 38;
    doc
      .fillColor("#17201c")
      .font("Helvetica")
      .fontSize(10)
      .text(item.description, columns[0], y, { width: widths[0] });
    doc.text(item.quantity, columns[1], y, { width: widths[1], align: "right" });
    doc.text(money(item.unitPrice), columns[2], y, { width: widths[2], align: "right" });
    doc.text(money(item.lineTotal), columns[3], y, { width: widths[3], align: "right" });
    doc
      .moveTo(48, y + 21)
      .lineTo(547, y + 21)
      .strokeColor("#dde4e1")
      .stroke();
  });
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("GRAND TOTAL", 350, 445)
    .fontSize(16)
    .fillColor("#173c34")
    .text(money(data.grandTotal), 452, 441, { width: 95, align: "right" });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#53635f")
    .text("Payment due within 21 days. Currency: USD.", 48, 720);
});

await writePdf("02-alternate-layout.pdf", (doc) => {
  const data = expected["02-alternate-layout.pdf"];
  doc.rect(0, 0, 210, 842).fill("#243447");
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(17)
    .text("HARBOR + PINE", 34, 54, { width: 160 });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#c8d2dc")
    .text("LOGISTICS\n\n17 Tideway Road\nTacoma, WA 98402\naccounts@harborpine.example", 34, 86, {
      width: 160,
      lineGap: 4,
    });
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#ffffff").text("DELIVERED FOR", 34, 250);
  doc
    .font("Helvetica")
    .fillColor("#c8d2dc")
    .text("Vela Community Foods\nDock 4, 1906 Alder Street\nSeattle, WA 98134", 34, 272, {
      width: 145,
      lineGap: 4,
    });
  doc.fillColor("#243447").font("Helvetica-Bold").fontSize(34).text("STATEMENT", 250, 54);
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#607080")
    .text("Reference", 252, 112)
    .fillColor("#243447")
    .font("Helvetica-Bold")
    .text(data.invoiceNumber, 340, 112);
  doc
    .font("Helvetica")
    .fillColor("#607080")
    .text("Service date", 252, 132)
    .fillColor("#243447")
    .font("Helvetica-Bold")
    .text("03 July 2026", 340, 132);
  doc
    .font("Helvetica")
    .fillColor("#607080")
    .text("Currency", 252, 152)
    .fillColor("#243447")
    .font("Helvetica-Bold")
    .text("USD", 340, 152);
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#243447").text("CHARGES", 252, 215);
  data.lineItems.forEach((item, index) => {
    const y = 250 + index * 72;
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#243447")
      .text(item.description, 252, y, { width: 210 });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#607080")
      .text(item.quantity + " at " + money(item.unitPrice), 252, y + 20);
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#243447")
      .text(money(item.lineTotal), 462, y, { width: 78, align: "right" });
    doc
      .moveTo(252, y + 46)
      .lineTo(540, y + 46)
      .strokeColor("#d6dde3")
      .stroke();
  });
  doc.roundedRect(252, 488, 288, 76, 8).fill("#e7ecef");
  doc.font("Helvetica").fontSize(10).fillColor("#607080").text("AMOUNT DUE", 272, 508);
  doc
    .font("Helvetica-Bold")
    .fontSize(24)
    .fillColor("#243447")
    .text(money(data.grandTotal) + " USD", 272, 526, { width: 248, align: "right" });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#607080")
    .text("Remit using reference HP-7729 by 17 July 2026.", 252, 610);
});

const scanSvg = [
  '<svg width="1240" height="1754" xmlns="http://www.w3.org/2000/svg">',
  '<rect width="1240" height="1754" fill="#eeeae1"/>',
  '<g font-family="Arial, sans-serif" fill="#57554f">',
  '<text x="92" y="112" font-size="42" font-weight="700">CEDAR RIDGE MAINTENANCE</text>',
  '<text x="92" y="150" font-size="18">Industrial service and emergency repair</text>',
  '<text x="930" y="112" font-size="48" font-weight="700">INVOICE</text>',
  '<text x="92" y="238" font-size="20">Customer: North Basin Water Cooperative</text>',
  '<text x="92" y="274" font-size="20">Service date: 22/06/2026</text>',
  '<text x="910" y="238" font-size="18" fill="#aaa69e">Ref: CRM-518B</text>',
  '<line x1="92" y1="330" x2="1145" y2="330" stroke="#8c8982" stroke-width="2"/>',
  '<text x="92" y="380" font-size="20" font-weight="700">WORK PERFORMED</text><text x="755" y="380" font-size="20">QTY</text><text x="860" y="380" font-size="20">RATE</text><text x="1040" y="380" font-size="20">TOTAL</text>',
  '<text x="92" y="445" font-size="22">Valve inspection</text><text x="775" y="445" font-size="22">2</text><text x="850" y="445" font-size="22">$145.00</text><text x="1030" y="445" font-size="22">$290.00</text>',
  '<text x="92" y="515" font-size="22">Seal replacement kit</text><text x="775" y="515" font-size="22">3</text><text x="858" y="515" font-size="22">$38.40</text><text x="1030" y="515" font-size="22">$115.20</text>',
  '<text x="92" y="585" font-size="22">Emergency callout</text><text x="775" y="585" font-size="22">1</text><text x="850" y="585" font-size="22">$210.00</text><text x="1030" y="585" font-size="22">$210.00</text>',
  '<line x1="92" y1="635" x2="1145" y2="635" stroke="#8c8982" stroke-width="2"/>',
  '<text x="790" y="710" font-size="24" font-weight="700">AMOUNT DUE</text><text x="1000" y="710" font-size="28" font-weight="700" fill="#9f9a91">$615.20</text>',
  '<text x="92" y="1580" font-size="18">Terms: due on receipt. Currency USD.</text>',
  "</g></svg>",
].join("");
const scanPng = await sharp(Buffer.from(scanSvg))
  .grayscale()
  .blur(0.45)
  .linear(0.82, 24)
  .rotate(-1.35, { background: "#e7e3da" })
  .png()
  .toBuffer();
await new Promise((resolve, reject) => {
  const document = new PDFDocument({
    size: "A4",
    margin: 0,
    info: {
      Title: "03-difficult-scan.pdf",
      Author: "Document Intelligence Agent sample generator",
    },
  });
  const stream = fs.createWriteStream(path.join(samplesDir, "03-difficult-scan.pdf"));
  stream.on("finish", resolve);
  stream.on("error", reject);
  document.pipe(stream);
  document.image(scanPng, 0, 0, { width: 595.28, height: 841.89 });
  document.end();
});

const workbook = XLSX.utils.book_new();
const rows = [
  [],
  ["", "MERIDIAN LAB SYSTEMS"],
  ["", "Precision instruments and laboratory supply"],
  [],
  ["", "Prepared for", "", "Invoice reference", "MLS-X2407"],
  ["", "Oriole Bioprocessing", "", "Issued", new Date(Date.UTC(2026, 4, 9))],
  ["", "42 Quarry Lane", "", "Currency", "USD"],
  ["", "Raleigh, NC 27601"],
  [],
  ["", "Item / service", "Qty", "Rate", "Extended"],
  ["", "Optical calibration panel", 1, 480, 480],
  ["", "Sterile sample trays", 6, 32.75, 196.5],
  ["", "Temperature probe set", 2, 118.25, 236.5],
  [],
  ["", "", "", "Invoice total", 913],
  [],
  ["", "Payment terms: Net 30"],
];
const sheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
sheet["!merges"] = [
  XLSX.utils.decode_range("B2:E2"),
  XLSX.utils.decode_range("B3:E3"),
  XLSX.utils.decode_range("B17:E17"),
];
sheet["!cols"] = [{ wch: 3 }, { wch: 34 }, { wch: 10 }, { wch: 16 }, { wch: 18 }];
for (const address of ["D11", "E11", "D12", "E12", "D13", "E13", "E15"])
  if (sheet[address]) sheet[address].z = "$#,##0.00";
if (sheet.E6) sheet.E6.z = "yyyy-mm-dd";
XLSX.utils.book_append_sheet(workbook, sheet, "Lab Invoice");
XLSX.writeFile(workbook, path.join(samplesDir, "04-offset-invoice.xlsx"), { compression: true });
await fsp.writeFile(
  path.join(samplesDir, "expected.json"),
  JSON.stringify(expected, null, 2) + "\n",
);
console.log("Generated 4 invoice samples in " + samplesDir);
