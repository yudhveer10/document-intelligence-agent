import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const rootPath = new URL("../", import.meta.url).pathname.replace(/^\/(.:)/, "$1");
const outputPath = rootPath + "samples/04-offset-invoice.xlsx";
await fs.mkdir(rootPath + "tmp", { recursive: true });
const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Lab Invoice");
sheet.showGridLines = false;
sheet.getRange("A1:E17").format.font = { name: "Arial", size: 10, color: "#17201C" };
sheet.getRange("B2:E2").merge();
sheet.getRange("B2").values = [["MERIDIAN LAB SYSTEMS"]];
sheet.getRange("B3:E3").merge();
sheet.getRange("B3").values = [["Precision instruments and laboratory supply"]];
sheet.getRange("B2").format.font = { name: "Arial", size: 16, bold: true, color: "#153C35" };
sheet.getRange("B3").format.font = { name: "Arial", size: 10, italic: true, color: "#59645F" };
sheet.getRange("B5:E8").values = [
  ["Prepared for", "", "Invoice reference", "MLS-X2407"],
  ["Oriole Bioprocessing", "", "Issued", new Date("2026-05-09T00:00:00Z")],
  ["42 Quarry Lane", "", "Currency", "USD"],
  ["Raleigh, NC 27601", "", "", ""],
];
sheet.getRange("E6").format.numberFormat = "yyyy-mm-dd";
sheet.getRange("B10:E13").values = [
  ["Item / service", "Qty", "Rate", "Extended"],
  ["Optical calibration panel", 1, 480, 480],
  ["Sterile sample trays", 6, 32.75, 196.5],
  ["Temperature probe set", 2, 118.25, 236.5],
];
sheet.getRange("B10:E10").format = {
  fill: "#153C35",
  font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" },
  verticalAlignment: "center",
};
sheet.getRange("C11:C13").format.numberFormat = "0.00";
sheet.getRange("D11:E13").format.numberFormat = "$#,##0.00";
sheet.getRange("D15:E15").values = [["Invoice total", 913]];
sheet.getRange("D15:E15").format.font = { name: "Arial", size: 11, bold: true, color: "#153C35" };
sheet.getRange("E15").format.numberFormat = "$#,##0.00";
sheet.getRange("B17:E17").merge();
sheet.getRange("B17").values = [["Payment terms: Net 30"]];
sheet.getRange("B17").format.font = { name: "Arial", size: 9, italic: true, color: "#59645F" };
sheet.getRange("A1").format.columnWidth = 3;
sheet.getRange("B1").format.columnWidth = 34;
sheet.getRange("C1").format.columnWidth = 10;
sheet.getRange("D1").format.columnWidth = 16;
sheet.getRange("E1").format.columnWidth = 18;
sheet.getRange("B10:E13").format.borders = {
  insideHorizontal: { style: "thin", color: "#D9DFDC" },
  bottom: { style: "thin", color: "#D9DFDC" },
};
workbook.recalculate();
const inspection = await workbook.inspect({
  kind: "table",
  range: "Lab Invoice!B2:E17",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 6,
});
console.log(inspection.ndjson);
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 50 },
  summary: "sample formula error scan",
});
console.log(errors.ndjson);
const preview = await workbook.render({
  sheetName: "Lab Invoice",
  range: "A1:E17",
  scale: 2,
  format: "png",
});
await fs.writeFile(
  rootPath + "tmp/excel-sample-preview.png",
  new Uint8Array(await preview.arrayBuffer()),
);
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
await fs.rm(outputPath + ".inspect.ndjson", { force: true });
console.log("Artifact Tool workbook saved to " + outputPath);
