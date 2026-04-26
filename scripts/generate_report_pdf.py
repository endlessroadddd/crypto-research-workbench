from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "课程大作业报告.md"
TARGET = ROOT / "deliverables" / "课程大作业报告.pdf"


def markdown_to_story(text: str):
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="ChineseTitle",
            fontName="STSong-Light",
            fontSize=22,
            leading=30,
            spaceAfter=18,
            textColor=colors.HexColor("#0B1F33"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="ChineseHeading",
            fontName="STSong-Light",
            fontSize=15,
            leading=22,
            spaceBefore=14,
            spaceAfter=8,
            textColor=colors.HexColor("#153A5B"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="ChineseBody",
            fontName="STSong-Light",
            fontSize=10.5,
            leading=17,
            spaceAfter=7,
            firstLineIndent=18,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ChineseCode",
            fontName="STSong-Light",
            fontSize=9.5,
            leading=14,
            leftIndent=12,
            rightIndent=12,
            borderColor=colors.HexColor("#D6DEE8"),
            borderWidth=0.5,
            borderPadding=7,
            backColor=colors.HexColor("#F4F7FB"),
            spaceBefore=6,
            spaceAfter=8,
        )
    )

    story = []
    in_code = False
    code_lines = []

    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        if line.startswith("```"):
            if in_code:
                story.append(Paragraph("<br/>".join(code_lines), styles["ChineseCode"]))
                code_lines = []
                in_code = False
            else:
                in_code = True
            continue

        if in_code:
            code_lines.append(line.replace(" ", "&nbsp;"))
            continue

        if not line:
            story.append(Spacer(1, 4))
            continue

        if line.startswith("# "):
            story.append(Paragraph(line[2:], styles["ChineseTitle"]))
            continue

        if line.startswith("## "):
            if story:
                story.append(Spacer(1, 4))
            story.append(Paragraph(line[3:], styles["ChineseHeading"]))
            continue

        if line.startswith("- "):
            story.append(Paragraph("• " + line[2:], styles["ChineseBody"]))
            continue

        story.append(Paragraph(line, styles["ChineseBody"]))

    return story


def main():
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    text = SOURCE.read_text(encoding="utf-8")
    doc = SimpleDocTemplate(
        str(TARGET),
        pagesize=A4,
        leftMargin=2.0 * cm,
        rightMargin=2.0 * cm,
        topMargin=1.8 * cm,
        bottomMargin=1.8 * cm,
        title="加密资产 AI 研究台 v3 项目报告",
    )
    doc.build(markdown_to_story(text))
    print(TARGET)


if __name__ == "__main__":
    main()
