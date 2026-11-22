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
ADVICE = '#514273'
ADVICE_LINE = '#78699e'
ADVICE_PALE = '#f2edf8'
SKIP = '#485c66'
SKIP_PALE = '#edf1f3'
RULE = '#cbd8d5'


@lru_cache
def font(size, bold=False):
    return ImageFont.truetype(FONT_PATH, size, index=2 if bold else 0)


def render(output):
    image = Image.new('RGB', (1824, 1766), '#f7faf8')
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
                       (960, 997), (1114, 1150), (1260, 1312)]:
        arrow([(478, start), (478, end)])
    draw.line([(1326, 631), (1326, 649), (478, 649)], fill=BLUE_LINE, width=5, joint='curve')
    arrow([(478, 631), (478, 668)])
    arrow([(866, 1057), (907, 1057)], SKIP)
    arrow([(866, 1205), (925, 1205)], ADVICE_LINE)
    arrow([(1326, 1285), (1326, 1312)], ADVICE_LINE)
    for start, end in [(330, 358), (473, 512)]:
        arrow([(1326, start), (1326, end)], BLUE_LINE)
    arrow([(474, 1431), (474, 1475)])
    arrow([(1326, 1431), (1326, 1475)])
    arrow([(96, 1548), (65, 1548), (65, 1372), (96, 1372)])

    card(96, 358, 770, 115, '一次性提交研究问题', ('支持文本、语音或附件，也可只提供一个要素',))
    card(96, 512, 770, 119, '读取来源', ('读取文本和文档，转写图片、扫描页并记录出处',))
    card(96, 668, 770, 113, '共用流程 · 提取候选条件', ('本地模型分批提取，候选条目就绪即送核对',))
    card(96, 816, 770, 144, '标准化框架要素并校验原文',
         ('本地模型整理框架字段与措辞，保留条件和例外。',
          '程序定位引文，校验阈值、单位和时间参照。'))
    card(96, 997, 770, 117, 'TypeSafe Jev 逐条独立核对',
         ('每次核对一条，判断框架字段、纳排方向和含义。',))
    card(907, 994, 470, 124, '略过未通过或未获判定的条目',
         ('明确不符合时略过该条，继续核对。', '缺少判定只重试该条一次，仍缺则略过。'),
         fill=SKIP_PALE, border='#d1dce1', accent=SKIP, title_size=26, body_size=21)
    text(495, 1120, '通过核对', 23, TEAL, bold=True)
    card(96, 1150, 770, 110, '通过项直接写入纳排标准', ('原文有歧义的候选单独交作者确认',))

    card(925, 1129, 803, 156, '机器端短问题 · 可选补充建议',
         ('已登记项目的短问题仅覆盖一个框架要素时触发。',
          '按框架提示最多两个待补要素，并附方法学出处。',
          '可采纳、补写或跳过。作者确认后才成为规则。'),
         fill=ADVICE_PALE, border='#d9cde8', accent=ADVICE, title_size=31, body_size=25)

    card(925, 358, 803, 115, '作者逐项填写研究问题', ('选择框架，按字段填写纳入、排除与例外',), accent=BLUE)
    card(925, 512, 803, 119, '点击 Generate', ('将各字段的手填内容作为原始材料提交',), accent=BLUE)

    card(96, 1312, 1632, 119, 'Criteria 预览',
         ('Review topic 与 Framework     ·     Inclusion 与 Exclusion     ·     Description',),
         fill=TEAL_PALE, border='#aacbc0', title_size=35, body_size=30)
    card(96, 1475, 770, 170, '作者核查与编辑',
         ('逐项采纳、改写或舍弃，也可直接编辑正文。',
          '待确认项由作者处理后直接生效。'))
    card(925, 1475, 803, 170, '保存、导出与交接',
         ('按项目保存，支持 Word 导出与 Search strategy 交接。',
          '筛选使用已生效的纳入与排除条件。',
          '结局仅在原文明确要求测量或报告时用于筛选。'),
         body_size=27)

    draw.line((96, 1675, 1728, 1675), fill=RULE, width=2)
    text(96, 1695, 'AIM-STEP   /   2026-11-22', 24, MUTED, bold=True)
    text(610, 1695, 'release 40 · 两种输入共用后续处理', 24, MUTED,
         max_width=1118)

    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, optimize=True)


if __name__ == '__main__':
    render(Path(__file__).resolve().parents[1] / 'figures' / 'eligibility-workflow.png')
