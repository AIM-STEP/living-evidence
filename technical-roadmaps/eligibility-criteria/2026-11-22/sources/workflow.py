"""Render the published workflow PNG with Pillow and Hiragino Sans GB."""

from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


FONT_PATH = '/System/Library/Fonts/Hiragino Sans GB.ttc'
PAPER = '#f8faf9'
INK = '#192f37'
BODY = '#354e58'
RULE = '#c9d9d6'
TEAL = '#17564d'
TEAL_LINE = '#397669'
TEAL_PALE = '#e5f3ee'
BLUE = '#244d77'
BLUE_LINE = '#52769a'
BLUE_PALE = '#eaf2fa'
AMBER = '#74470b'
AMBER_LINE = '#92621e'
AMBER_PALE = '#fff3db'
VIOLET = '#55427c'
VIOLET_LINE = '#7965a0'
VIOLET_PALE = '#f2edf9'
SLATE = '#435b66'
SLATE_LINE = '#667c85'
SLATE_PALE = '#edf1f3'


@lru_cache
def font(size, bold=False):
    return ImageFont.truetype(FONT_PATH, size, index=2 if bold else 0)


def render(output):
    image = Image.new('RGB', (1840, 2363), PAPER)
    draw = ImageDraw.Draw(image)

    def text(x, y, value, size, color=INK, *, bold=False, width=None):
        face = font(size, bold)
        if width is not None and draw.textlength(value, font=face) > width:
            raise ValueError(f'Text exceeds its allotted width: {value}')
        draw.text((x, y), value, fill=color, font=face, anchor='lt')

    def card(x, y, width, height, title, lines, *, fill='#ffffff',
             outline=RULE, heading=TEAL, title_size=38, body_size=30):
        draw.rounded_rectangle((x, y, x + width, y + height), radius=22,
                               fill=fill, outline=outline, width=2)
        inset = 28
        text(x + inset, y + 20, title, title_size, heading, bold=True,
             width=width - 2 * inset)
        body_y = y + 30 + title_size
        if body_y + (len(lines) - 1) * (body_size + 9) + body_size > y + height - 12:
            raise ValueError(f'Text exceeds its allotted height: {title}')
        for index, line in enumerate(lines):
            text(x + inset, body_y + index * (body_size + 9), line, body_size, BODY,
                 width=width - 2 * inset)

    def connector(points, color=TEAL_LINE, *, arrowhead=True):
        draw.line(points, fill=color, width=5, joint='curve')
        if not arrowhead:
            return
        (previous_x, previous_y), (x, y) = points[-2:]
        if previous_x == x:
            direction = 1 if y > previous_y else -1
            base = [(x - 10, y - 15 * direction), (x + 10, y - 15 * direction)]
        else:
            direction = 1 if x > previous_x else -1
            base = [(x - 15 * direction, y - 10), (x - 15 * direction, y + 10)]
        draw.polygon([(x, y), *base], fill=color)

    text(96, 72, 'Eligibility Criteria 技术流程图', 70, bold=True, width=1648)
    text(100, 170, '从研究问题到可用于检索和筛选的纳入与排除标准', 33, BODY)
    draw.line((96, 229, 1744, 229), fill=RULE, width=2)

    # The input paths meet before any extraction or source review.
    connector([(495, 418), (495, 441), (920, 441)], arrowhead=False)
    connector([(1345, 418), (1345, 441), (920, 441)], BLUE_LINE, arrowhead=False)
    for start, end in [(441, 464), (596, 632), (784, 820)]:
        connector([(920, start), (920, end)])

    # Branch separately for accepted rules, author decisions and skipped items.
    connector([(920, 969), (920, 1016)], arrowhead=False)
    connector([(920, 1016), (356, 1016), (356, 1080)])
    connector([(920, 1016), (920, 1080)], AMBER_LINE)
    connector([(920, 1016), (1484, 1016), (1484, 1080)], SLATE_LINE)
    draw.ellipse((913, 1009, 927, 1023), fill=TEAL_LINE)
    connector([(356, 1326), (356, 1638)])
    connector([(920, 1326), (920, 1638)], AMBER_LINE)
    connector([(1484, 1326), (1484, 1370), (1185, 1370), (1185, 1638)], SLATE_LINE)

    # A sparse input can produce optional advice alongside the review result.
    connector([(1744, 706), (1785, 706), (1785, 1484), (1744, 1484)], VIOLET_LINE)
    connector([(1484, 1598), (1484, 1638)], VIOLET_LINE)
    connector([(920, 1809), (920, 1847)])
    connector([(920, 2018), (920, 2056)])

    card(96, 270, 798, 148, '机器生成  Machine generate',
         ('一次性提交研究问题，可用文本、语音或附件。',
          '也可只提供一个框架要素。'),
         fill=TEAL_PALE, outline='#b9d6ce', body_size=29)
    card(946, 270, 798, 148, '人工生成  Manual generate',
         ('选定框架，按字段填写纳入、排除及例外。',
          '也可只填一个框架要素，再点击 Generate。'),
         fill=BLUE_PALE, outline='#bed0e6', heading=BLUE, body_size=29)

    card(96, 464, 1648, 132, '准备原始材料',
         ('每次 Generate 都重新读取输入和附件，并记录来源。',))
    card(96, 632, 1648, 152, '提取候选条件并标准化框架要素',
         ('程序记录原文条款和位置，本地模型按来源提取、标准化，漏项定向补提。',
          '保留阈值、单位、时点、例外以及混合人群和联合干预条件。'))
    card(96, 820, 1648, 149, 'TypeSafe Jev 逐条独立核对',
         ('核对每条的框架字段、纳排方向和规则含义。',
          '每生成一条候选就核对一条，其他来源可以继续提取。'))

    card(96, 1080, 520, 246, '通过 · 写入标准',
         ('每条通过即写入项目草稿。',
          'Criteria 预览同步显示。',
          '研究关注内容保留在说明中。'),
         fill=TEAL_PALE, outline='#b9d6ce', title_size=36, body_size=27)
    card(660, 1080, 520, 246, '需要人工核对',
         ('原文有歧义、冲突或明确待定。',
          '框架、纳排方向或组合范围未定。',
          'Jev 歧义，两项评分 ≥0.98。',
          '待确认的条目暂缓用于筛选。'),
         fill=AMBER_PALE, outline='#e1c394', heading=AMBER, title_size=36, body_size=27)
    card(1224, 1080, 520, 246, '略过 · 保留缺项',
         ('原文明确不支持该候选。',
          '判定不充分时，只重试该条一次。',
          '仍无判定则略过，继续核对。',
          '明示条款缺项留在草稿中。'),
         fill=SLATE_PALE, outline='#cfdbdf', heading=SLATE, title_size=36, body_size=27)

    card(1224, 1370, 520, 228, '短问题 · 可选补充建议',
         ('两种输入均可触发。',
          '适用于已登记项目的单要素短问题。',
          '最多两项建议，附方法学出处。',
          '可跳过，采纳后写入标准。'),
         fill=VIOLET_PALE, outline='#d9cdeb', heading=VIOLET, title_size=33, body_size=26)

    card(96, 1638, 1648, 171, 'Criteria 预览与作者确认',
         ('Review topic  ·  Framework  ·  Inclusion  ·  Exclusion  ·  Description',
          '生成期间显示已通过的规则。原文仍有未覆盖条款时，保存草稿并标出缺项。'),
         fill=TEAL_PALE, outline='#b9d6ce')
    card(96, 1847, 1648, 171, '保存、双语呈现与导出',
         ('问题为非英语时按相同结构生成原语言版。两版均可编辑、保存和导出。',
          '未核对的原文条款及生成不完整状态随预览和 Word 保留。'))
    card(96, 2056, 1648, 155, '什么会进入筛选？',
         ('原文条款核对完成后，才交接已生效的规则、组合关系及例外。',
          '原文明确要求测量或报告的结局可用于筛选，其他结局保留在说明中。'))

    draw.line((96, 2260, 1744, 2260), fill=RULE, width=2)
    text(96, 2285, 'AIM-STEP', 26, BODY, bold=True)
    text(1136, 2285, '2026-11-23  /  Eligibility Criteria release 53', 25, BODY, width=608)

    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, optimize=True)


if __name__ == '__main__':
    render(Path(__file__).resolve().parents[1] / 'figures' / 'eligibility-workflow.png')
