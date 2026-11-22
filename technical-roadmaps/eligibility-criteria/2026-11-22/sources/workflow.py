"""Render the workflow PNG with Pillow and Hiragino Sans GB (macOS)."""

from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


FONT_PATH = '/System/Library/Fonts/Hiragino Sans GB.ttc'
INK = '#152b33'
MUTED = '#42585e'
TEAL = '#14594f'
TEAL_LINE = '#39796d'
TEAL_PALE = '#e4f2ed'
BLUE = '#244d76'
BLUE_LINE = '#507397'
BLUE_PALE = '#eaf1f8'
ERROR = '#8a433a'
ERROR_PALE = '#fbefeb'
RULE = '#cbd8d5'


@lru_cache
def font(size, bold=False):
    return ImageFont.truetype(FONT_PATH, size, index=2 if bold else 0)


def render(output):
    image = Image.new('RGB', (1824, 1864), '#f7faf8')
    draw = ImageDraw.Draw(image)

    def text(x, y, value, size, color=INK, *, bold=False, max_width=None):
        face = font(size, bold)
        if max_width is not None and draw.textlength(value, font=face) > max_width:
            raise ValueError(f'Text exceeds its allotted width: {value}')
        draw.text((x, y), value, fill=color, font=face, anchor='lt')

    def arrow(points, color=TEAL_LINE):
        draw.line(points, fill=color, width=5, joint='curve')
        (previous_x, previous_y), (x, y) = points[-2:]
        if previous_x == x:
            direction = 1 if y > previous_y else -1
            base = [(x - 9, y - direction * 14), (x + 9, y - direction * 14)]
        else:
            direction = 1 if x > previous_x else -1
            base = [(x - direction * 14, y - 9), (x - direction * 14, y + 9)]
        draw.polygon([(x, y), *base], fill=color)

    def card(x, y, width, height, title, lines=(), *, fill='white',
             border=RULE, accent=TEAL, title_size=33, body_size=29):
        draw.rounded_rectangle((x, y, x + width, y + height), radius=18,
                               fill=fill, outline=border, width=2)
        text(x + 24, y + 17, title, title_size, accent, bold=True, max_width=width - 48)
        for index, line in enumerate(lines):
            text(x + 24, y + 24 + title_size + index * (body_size + 8), line,
                 body_size, MUTED, max_width=width - 48)

    text(96, 72, 'Eligibility Criteria 技术流程图', 64, bold=True)
    text(98, 158, '从研究输入到可供检索和筛选使用的纳入与排除标准', 32, MUTED)
    draw.line((96, 222, 1728, 222), fill=RULE, width=2)

    card(96, 258, 1038, 72, '机器生成   Machine generate', fill=TEAL_PALE,
         border=TEAL_PALE, title_size=35)
    card(1188, 258, 540, 72, '人工生成   Manual generate', fill=BLUE_PALE,
         border=BLUE_PALE, accent=BLUE, title_size=33)

    for start, end in [(330, 358), (473, 505), (597, 640), (759, 796),
                       (909, 944), (1058, 1095), (1212, 1248), (1358, 1410)]:
        arrow([(478, start), (478, end)])
    arrow([(866, 551), (907, 551)])
    arrow([(1134, 551), (1157, 551), (1157, 1410)])
    arrow([(866, 1155), (907, 1155)], ERROR)
    for start, end in [(330, 358), (473, 512)]:
        arrow([(1458, start), (1458, end)], BLUE_LINE)
    arrow([(1458, 657), (1458, 693), (1760, 693), (1760, 1470), (1728, 1470)],
          BLUE_LINE)
    arrow([(474, 1529), (474, 1573)])
    arrow([(1326, 1529), (1326, 1573)])
    arrow([(96, 1646), (65, 1646), (65, 1470), (96, 1470)])

    card(96, 358, 770, 115, '输入研究材料', ('研究问题、语音转写或附件',))
    card(96, 505, 770, 92, '当前项目已有匹配的已保存结果？', fill=TEAL_PALE,
         border='#aacbc0')
    card(907, 500, 227, 103, '有 · 复用', ('进入预览',), title_size=28, body_size=24)
    text(495, 600, '无', 23, TEAL, bold=True)
    card(96, 640, 770, 119, '读取来源', ('读取文本和文档，转写图片、扫描页并记录出处',))
    card(96, 796, 770, 113, '提取候选条件', ('本地模型分批抽取，结合项目登记和原文确定框架',))
    card(96, 944, 770, 114, '定位原文并校验', ('核对引文、入排方向、阈值、单位、时点及例外',))
    card(96, 1095, 770, 117, 'TypeSafe Jev 独立核对', ('对有明确引文的候选项逐条核对',))
    card(907, 1092, 227, 124, '缺少判定', ('仅重试缺失项一次', '仍缺则报错'),
         fill=ERROR_PALE, border='#e4c2ba', accent=ERROR, title_size=26, body_size=21)
    text(495, 1218, '核对完成', 23, TEAL, bold=True)
    card(96, 1248, 770, 110, '构建规则与待确认项', ('区分筛选条件、关注结局和可选建议',))

    card(1188, 358, 540, 115, '作者填写规则', ('选择框架，填写纳入、排除与例外',), accent=BLUE)
    card(1188, 512, 540, 145, '点击 Generate', ('按手填原文定位并核对规则', '整理措辞，再复核规则含义'), accent=BLUE)

    card(1212, 795, 488, 226, '什么会进入筛选？',
         ('有效的纳入与排除条件。', '关注结局仅在原文明确要求研究',
          '测量或报告时才成为资格条件。', '可选范围建议须由作者采纳。'),
         fill='#f0f5f3', border='#d6e2de', title_size=28, body_size=25)

    card(96, 1410, 1632, 119, 'Criteria 预览',
         ('Review topic 与 Framework     ·     Inclusion 与 Exclusion     ·     Description',),
         fill=TEAL_PALE, border='#aacbc0', title_size=35, body_size=30)
    card(96, 1573, 770, 146, '作者核查与编辑',
         ('逐项采纳、改写或舍弃，也可直接编辑正文。',
          '机器生成的待确认项由作者处理后直接生效。'))
    card(925, 1573, 803, 146, '保存、导出与交接',
         ('按项目保存，并可导出 Word。', '已生效的规则供 Search strategy 与筛选使用。'))

    draw.line((96, 1773, 1728, 1773), fill=RULE, width=2)
    text(96, 1793, 'AIM-STEP   /   2026-11-22', 24, MUTED, bold=True)
    text(610, 1793, '主流程覆盖线上 release 36 与工作区 release 37', 24, MUTED,
         max_width=1118)

    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, optimize=True)


if __name__ == '__main__':
    render(Path(__file__).resolve().parents[1] / 'figures' / 'eligibility-workflow.png')
