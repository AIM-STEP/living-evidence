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
    image = Image.new('RGB', (1824, 1736), '#f7faf8')
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

    card(96, 258, 770, 72, '机器生成   Machine generate', fill=TEAL_PALE,
         border=TEAL_PALE, title_size=35)
    card(925, 258, 803, 72, '人工生成   Manual generate', fill=BLUE_PALE,
         border=BLUE_PALE, accent=BLUE, title_size=33)

    for start, end in [(330, 358), (473, 512), (781, 816),
                       (930, 967), (1084, 1120), (1230, 1282)]:
        arrow([(478, start), (478, end)])
    draw.line([(1326, 631), (1326, 649), (478, 649)], fill=BLUE_LINE, width=5, joint='curve')
    arrow([(478, 631), (478, 668)])
    arrow([(866, 1027), (907, 1027)], ERROR)
    for start, end in [(330, 358), (473, 512)]:
        arrow([(1326, start), (1326, end)], BLUE_LINE)
    arrow([(474, 1401), (474, 1445)])
    arrow([(1326, 1401), (1326, 1445)])
    arrow([(96, 1518), (65, 1518), (65, 1342), (96, 1342)])

    card(96, 358, 770, 115, '一次性输入完整研究问题', ('可通过文本、语音或附件提供',))
    card(96, 512, 770, 119, '读取来源', ('读取文本和文档，转写图片、扫描页并记录出处',))
    card(96, 668, 770, 113, '共用流程 · 提取候选条件', ('本地模型依据来源与研究框架分批提取',))
    card(96, 816, 770, 114, '定位原文并校验', ('核对引文、入排方向、阈值、单位、时点及例外',))
    card(96, 967, 770, 117, 'TypeSafe Jev 独立核对', ('对有明确引文的候选项逐条核对',))
    card(907, 964, 227, 124, '缺少判定', ('仅重试缺失项一次', '仍缺则报错'),
         fill=ERROR_PALE, border='#e4c2ba', accent=ERROR, title_size=26, body_size=21)
    text(495, 1090, '核对完成', 23, TEAL, bold=True)
    card(96, 1120, 770, 110, '构建规则与待确认项', ('区分筛选条件、关注结局和可选建议',))

    card(925, 358, 803, 115, '作者逐项填写研究问题', ('选择框架，按字段填写纳入、排除与例外',), accent=BLUE)
    card(925, 512, 803, 119, '点击 Generate', ('将各字段的手填内容作为原始材料提交',), accent=BLUE)

    card(1212, 795, 488, 226, '什么会进入筛选？',
         ('有效的纳入与排除条件。', '关注结局仅在原文明确要求研究',
          '测量或报告时才成为资格条件。', '可选范围建议须由作者采纳。'),
         fill='#f0f5f3', border='#d6e2de', title_size=28, body_size=25)

    card(96, 1282, 1632, 119, 'Criteria 预览',
         ('Review topic 与 Framework     ·     Inclusion 与 Exclusion     ·     Description',),
         fill=TEAL_PALE, border='#aacbc0', title_size=35, body_size=30)
    card(96, 1445, 770, 146, '作者核查与编辑',
         ('逐项采纳、改写或舍弃，也可直接编辑正文。',
          '待确认项由作者处理后直接生效。'))
    card(925, 1445, 803, 146, '保存、导出与交接',
         ('按项目保存，并可导出 Word。', '已生效的规则供 Search strategy 与筛选使用。'))

    draw.line((96, 1645, 1728, 1645), fill=RULE, width=2)
    text(96, 1665, 'AIM-STEP   /   2026-11-22', 24, MUTED, bold=True)
    text(610, 1665, 'release 39 · 两种输入共用后续处理', 24, MUTED,
         max_width=1118)

    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, optimize=True)


if __name__ == '__main__':
    render(Path(__file__).resolve().parents[1] / 'figures' / 'eligibility-workflow.png')
