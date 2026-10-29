import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { Plan } from '../model/types';
import { TileReportService } from '../model/tile-report-service';

type WallReport = ReturnType<TileReportService['analyze']>['walls'][number];

/** Writes selectable report text and tables, with room previews and individual surface pages. */
export class PdfReport {
  private report = new TileReportService();
  private pdf!: jsPDF;
  private y = 12;
  private readonly margin = 12;
  private readonly width = 186;

  public generate(
    plan: Plan,
    drawing: string,
    preview: string | null,
    surfaceDrawings: string[] = [],
  ): ArrayBuffer {
    this.pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    this.pdf.setProperties({
      title: plan.name,
      subject: 'Tiling report',
      creator: 'Tiling editor',
    });
    this.y = this.margin;
    const report = this.report.analyze(plan);
    this.paragraph(plan.name, 22, true);
    this.paragraph('Tile report', 16, true);
    this.paragraph('Complete room', 12, true);
    this.paragraph(
      `Wall area: ${this.area(report.wallAreaM2)}    Tile region area: ${this.area(report.regionAreaM2)}`,
    );
    this.previewStack(drawing, preview);
    this.pdf.addPage();
    this.y = this.margin;
    this.paragraph('Tile information', 16, true);
    if (report.tileTypes.size) {
      this.paragraph('Tiles needed for the complete room', 11, true);
      this.table(
        ['Tile type', 'Area', 'Tiles needed'],
        [...report.tileTypes].map(([name, total]) => [
          name,
          total.complete ? this.area(total.areaM2) : 'Unavailable',
          total.complete ? total.count.toLocaleString() : 'Unavailable',
        ]),
      );
    }
    this.paragraph(
      'Wall areas cover the complete outline. Tile region areas include grout, inset and overlapping regions. Each partial tile counts as one; offcuts are not reused.',
      9,
    );
    if (!report.walls.length) this.paragraph('No walls or tile regions.');
    for (const { wall, result, areaM2 } of report.walls) {
      this.ensureSpace(38);
      this.pdf.setDrawColor(220, 229, 225);
      this.pdf.line(this.margin, this.y, 198, this.y);
      this.y += 5;
      this.paragraph(wall.name, 13, true);
      this.paragraph(`Wall area: ${this.area(areaM2)}`);
      if (!wall.patternRegions.length) this.paragraph('No tile regions.', 9);
      else
        this.table(
          ['Tile region', 'Area', 'Selected tile', 'Tiles needed'],
          wall.patternRegions.map((region, index) => {
            const detail = result?.regions[index];
            return [
              `Tile region ${index + 1}${region.fullWall ? ' · Full wall' : ''}`,
              this.area(detail?.areaM2 ?? null),
              region.pattern || 'No tile selected',
              detail ? detail.count.toLocaleString() : 'Unavailable',
            ];
          }),
        );
      if (!result) this.paragraph('Region results exceed the calculation limit.', 9);
    }
    report.walls.forEach((surface, index) => {
      const image = surfaceDrawings[index];
      if (image) this.surfacePage(surface, image);
    });
    const pages = this.pdf.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      this.pdf.setPage(page);
      this.pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(90);
      this.pdf.text(`${page} / ${pages}`, 198, 289, { align: 'right' });
    }
    return this.pdf.output('arraybuffer');
  }

  private previewStack(drawing: string, preview: string | null) {
    const gap = 6;
    const imageY = this.y + 10;
    const imageHeight = Math.min(100, (280 - imageY - gap) / 2);
    const panel = (image: string | null, y: number) => {
      if (!image) {
        this.pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90);
        this.pdf.text('Preview unavailable in this browser.', this.margin, y, {
          maxWidth: this.width,
        });
      } else {
        const properties = this.pdf.getImageProperties(image);
        const scale = Math.min(this.width / properties.width, imageHeight / properties.height);
        const width = properties.width * scale;
        const height = properties.height * scale;
        this.pdf.addImage(
          image,
          'PNG',
          this.margin + (this.width - width) / 2,
          y,
          width,
          height,
          undefined,
          'FAST',
        );
      }
    };
    panel(preview, imageY);
    panel(drawing, imageY + imageHeight + gap);
    this.y = imageY + imageHeight * 2 + gap;
  }

  private area(value: number | null): string {
    return value === null
      ? 'Unavailable'
      : `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} m²`;
  }
  private ensureSpace(height: number) {
    if (this.y + height > 280) {
      this.pdf.addPage();
      this.y = this.margin;
    }
  }
  private paragraph(text: string, size = 10, bold = false) {
    this.pdf
      .setFont('helvetica', bold ? 'bold' : 'normal')
      .setFontSize(size)
      .setTextColor(23, 41, 35);
    const lines = this.pdf.splitTextToSize(text, this.width) as string[];
    const height = size * 0.45;
    for (const line of lines) {
      this.ensureSpace(height);
      this.y += height;
      this.pdf.text(line, this.margin, this.y);
    }
    this.y += 4;
  }
  private table(head: string[], body: string[][]) {
    let endY = this.y;
    autoTable(this.pdf, {
      startY: this.y,
      head: [head],
      body,
      theme: 'plain',
      margin: { left: this.margin, right: this.margin, top: this.margin, bottom: 17 },
      styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 3,
        textColor: [23, 41, 35],
        lineColor: [220, 229, 225],
        lineWidth: { bottom: 0.2 },
        overflow: 'linebreak',
      },
      headStyles: { fillColor: [238, 245, 241], fontStyle: 'bold' },
      rowPageBreak: 'avoid',
      showHead: 'everyPage',
      didDrawPage: (data) => {
        endY = data.cursor?.y ?? endY;
      },
    });
    this.y = endY + 6;
  }
  private surfacePage(surface: WallReport, image: string) {
    this.pdf.addPage();
    this.y = this.margin;
    this.paragraph(`Details: ${surface.wall.name}`, 16, true);
    const properties = this.pdf.getImageProperties(image);
    const imageHeight = 90;
    const scale = Math.min(this.width / properties.width, imageHeight / properties.height);
    const width = properties.width * scale;
    const height = properties.height * scale;
    this.pdf.addImage(
      image,
      'PNG',
      this.margin + (this.width - width) / 2,
      this.y,
      width,
      height,
      undefined,
      'FAST',
    );
    this.y += height + 8;
    this.paragraph(`Wall area: ${this.area(surface.areaM2)}`);
    if (!surface.wall.patternRegions.length) this.paragraph('No tile regions.', 9);
    else
      this.table(
        ['Tile region', 'Area', 'Selected tile', 'Tiles needed'],
        surface.wall.patternRegions.map((region, index) => {
          const detail = surface.result?.regions[index];
          return [
            `Tile region ${index + 1}${region.fullWall ? ' · Full wall' : ''}`,
            this.area(detail?.areaM2 ?? null),
            region.pattern || 'No tile selected',
            detail ? detail.count.toLocaleString() : 'Unavailable',
          ];
        }),
      );
    if (!surface.result) this.paragraph('Region results exceed the calculation limit.', 9);
  }
}
