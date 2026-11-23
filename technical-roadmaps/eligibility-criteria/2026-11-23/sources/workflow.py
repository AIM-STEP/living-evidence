"""Render the Eligibility Criteria workflow for release 59."""

from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT = '/System/Library/Fonts/Hiragino Sans GB.ttc'
PAPER, WHITE, INK, BODY, RULE = '#f7f9f8', '#ffffff', '#172f36', '#344e58', '#cedbd8'
TEAL, TEAL_LINE, TEAL_BG = '#17564d', '#397669', '#e6f3ed'
BLUE, BLUE_LINE, BLUE_BG = '#244d77', '#52769a', '#eaf2fa'
AMBER, AMBER_LINE, AMBER_BG = '#74470b', '#92621e', '#fff3db'
SLATE, SLATE_LINE, SLATE_BG = '#435b66', '#667c85', '#edf1f3'
VIOLET, VIOLET_LINE, VIOLET_BG = '#55427c', '#7965a0', '#f2edf9'


@lru_cache
def font(size, bold=False):
    return ImageFont.truetype(FONT, size, index=2 if bold else 0)


def render(output):
    image = Image.new('RGB', (1920, 2920), PAPER)
    draw = ImageDraw.Draw(image)

    def text(x, y, value, size, color=INK, *, bold=False, width=None):
        face = font(size, bold)
        if width is not None and draw.textlength(value, font=face) > width:
            raise ValueError(f'Text exceeds its allotted width: {value}')
        draw.text((x, y), value, font=face, fill=color, anchor='lt')

    def card(x, y, width, height, title, lines, *, fill=WHITE, heading=TEAL,
             outline=RULE, title_size=36, body_size=28):
        draw.rounded_rectangle((x, y, x + width, y + height), radius=22,
                               fill=fill, outline=outline, width=2)
        inset = 27
        text(x + inset, y + 20, title, title_size, heading, bold=True,
             width=width - 2 * inset)
        body_y = y + 25 + title_size
        if body_y + (len(lines) - 1) * (body_size + 7) + body_size > y + height - 10:
            raise ValueError(f'Text exceeds its allotted height: {title}')
        for index, line in enumerate(lines):
            text(x + inset, body_y + index * (body_size + 7), line, body_size, BODY,
                 width=width - 2 * inset)

    def arrow(points, color=TEAL_LINE, *, head=True):
        draw.line(points, fill=color, width=5, joint='curve')
        if not head:
            return
        (previous_x, previous_y), (x, y) = points[-2:]
        if previous_x == x:
            direction = 1 if y > previous_y else -1
            base = [(x - 9, y - 14 * direction), (x + 9, y - 14 * direction)]
        else:
            direction = 1 if x > previous_x else -1
            base = [(x - 14 * direction, y - 9), (x - 14 * direction, y + 9)]
        draw.polygon([(x, y), *base], fill=color)

    def junction(x, y):
        draw.ellipse((x - 7, y - 7, x + 7, y + 7), fill=TEAL_LINE)

    text(96, 67, 'Eligibility Criteria 技术流程图', 69, bold=True)
    text(100, 167, '从原文条款到经过验证的纳入与排除标准', 33, BODY)
    draw.line((96, 224, 1824, 224), fill=RULE, width=2)

    # Draw connectors first. The cards keep all text clear of connector ends.
    arrow([(515, 409), (515, 438), (960, 438)], head=False)
    arrow([(1405, 409), (1405, 438), (960, 438)], BLUE_LINE, head=False)
    arrow([(960, 438), (960, 468)])
    arrow([(960, 616), (960, 635), (650, 635), (650, 654)])
    for start, end in [(830, 868), (1051, 1089), (1272, 1310)]:
        arrow([(650, start), (650, end)])

    arrow([(1204, 736), (1264, 736)], VIOLET_LINE)
    arrow([(1824, 736), (1868, 736), (1868, 1851), (1824, 1851)], VIOLET_LINE)
    for y in (868, 1089):
        arrow([(1204, y + 74), (1264, y + 74)], BLUE_LINE)
        arrow([(1264, y + 144), (1204, y + 144)], BLUE_LINE)

    arrow([(960, 1479), (960, 1512)], head=False)
    arrow([(960, 1512), (366, 1512), (366, 1548)])
    arrow([(960, 1512), (960, 1548)], AMBER_LINE)
    arrow([(960, 1512), (1554, 1512), (1554, 1548)], SLATE_LINE)
    junction(960, 1512)
    arrow([(366, 1786), (366, 1826)])
    arrow([(960, 1786), (960, 1826)], AMBER_LINE)
    arrow([(1554, 1786), (1554, 1826)], SLATE_LINE)
    arrow([(960, 2018), (960, 2060)])
    arrow([(960, 2227), (960, 2261)], head=False)
    arrow([(960, 2261), (515, 2261), (515, 2297)])
    arrow([(960, 2261), (1405, 2261), (1405, 2297)], AMBER_LINE)
    junction(960, 2261)

    card(96, 258, 838, 151, '机器生成  Machine generate',
         ('一次性提交研究问题，可用文字、语音或附件。',
          '资料很少时，也可以只提交一个框架要素。'), fill=TEAL_BG, outline='#b9d6ce')
    card(986, 258, 838, 151, '人工生成  Manual generate',
         ('选择框架，按要素填写纳入、排除和例外。',
          '填完后点击 Generate。'), fill=BLUE_BG, heading=BLUE, outline='#bed0e6')
    card(96, 468, 1728, 148, '读取当前输入和附件',
         ('两种入口汇合。每次生成都读取当前材料，记录来源与版本。',
          '为当前输入建立生成草稿记录。'))

    card(96, 654, 1108, 176, '独立登记原文条款',
         ('记录可识别的明示条款和原文位置。',
          '登记纳排方向、阈值与时点、备选项、例外及明确不限。',
          '明确必须测量或报告的结局也列入条款清单。'))
    card(1264, 654, 560, 176, '短问题补充建议',
         ('两种入口均可触发。已登记项目只给',
          '一个要素时，最多给两条带出处的建议。',
          '作者可采纳、补写或跳过。'), fill=VIOLET_BG, heading=VIOLET,
         outline='#d9cdeb', title_size=34, body_size=25)

    card(96, 868, 1108, 183, '本地模型分批提取并标准化',
         ('定位原文引文，把候选归入所选或适用的框架。',
          '保留备选项、联合关系及例外的适用范围。',
          '已就绪的候选可以先核对，其余批次继续提取。'))
    card(1264, 868, 560, 183, '提取超时或回复不可读',
         ('改用更短的请求，多片段批次沿原文拆分。',
          '首次等待上限 180 秒，重试 120 秒。',
          '仍无法读取时记录未处理的原文。'),
         fill=BLUE_BG, heading=BLUE, outline='#bed0e6', title_size=33, body_size=24)

    card(96, 1089, 1108, 183, '候选与原文条款逐项比对',
         ('核验引文和措辞，检查阈值、单位、时点及备选项。',
          '检查明确不限的规定是否保留。定位缺项的原文。',
          '检查关联条款是否保留在同一条件和逻辑关系中。'))
    card(1264, 1089, 560, 183, '发现缺项或限定丢失',
         ('定位对应原文，定向补提或修正措辞。',
          '独立补回的条款可与已通过的规则合并。',
          '涉及分支或例外时保留原有组合关系。'),
         fill=BLUE_BG, heading=BLUE, outline='#bed0e6', title_size=33, body_size=24)

    card(96, 1310, 1728, 169, 'TypeSafe Jev 逐条独立核对',
         ('根据原文及其语境，核对框架要素、纳排方向、限制、例外和规则含义。',
          '检查等价单位、时间参照、备选关系，以及原文是否真的要求测量或报告结局。',
          '每有一条候选就核对一条，其他来源仍可继续处理。'))

    card(96, 1548, 540, 238, '通过 · 写入草稿',
         ('通过后立即写入项目草稿。',
          'Criteria 预览同步显示。',
          '原文可独立佐证，Jev 倾向支持时，',
          '低置信度的条目也可通过。'),
         fill=TEAL_BG, outline='#b9d6ce', title_size=33, body_size=24)
    card(690, 1548, 540, 238, '需要作者核对',
         ('原文歧义、冲突或明确待定。',
          '引文语境、纳排方向或组合范围未定。',
          '仅 Jev 判有歧义时，两项评分均 ≥ 0.98。',
          '作者确认后重新验证。'),
         fill=AMBER_BG, heading=AMBER, outline='#e1c394', title_size=33, body_size=24)
    card(1284, 1548, 540, 238, '略过 · 继续处理',
         ('原文明确不支持该候选时略过。',
          '判定不足时只重试该条一次。',
          '仍无法通过时略过，保留其他条目。',
          '明示条款仍有缺漏时标明对应原文。'),
         fill=SLATE_BG, heading=SLATE, outline='#cfdbdf', title_size=33, body_size=24)

    card(96, 1826, 1728, 192, 'Criteria 预览、保存与导出',
         ('按研究主题、框架、纳入、排除和文字描述显示结果。待确认项和缺项随草稿保存。',
          '英文版在上，非英语问题在下方提供同结构的原语言版。两版均可编辑。',
          'Word 导出保留双语结构及待确认或未处理的原文。'),
         fill=TEAL_BG, outline='#b9d6ce')

    card(96, 2060, 1728, 167, '什么会进入筛选？',
         ('交接前将成稿与原文条款清单再次比对。核查是否有缺项、是否还有作者确认、验证是否通过及输入是否变化。',
          '区分研究关注的结局与明确写入纳排条件的结局。'),
         title_size=39, body_size=29)

    card(96, 2297, 838, 187, '通过 · 交接生效标准',
         ('交接已验证的纳排规则、组合逻辑和例外。',
          '只有原文明示必须测量或报告的结局才成为筛选条件。',
          '其他结局留在文字描述。'),
         fill=TEAL_BG, outline='#b9d6ce', title_size=32, body_size=25)
    card(986, 2297, 838, 187, '有缺项或待确认 · 暂停交接',
         ('缺项、待确认、验证失败或输入变更时，暂停交接。',
          '保留当前草稿和上一份有效的下游交接。',
          '作者确认后可重新检查交接状态。'),
         fill=AMBER_BG, heading=AMBER, outline='#e1c394', title_size=32, body_size=25)

    draw.line((96, 2543, 1824, 2543), fill=RULE, width=2)
    card(96, 2577, 1728, 178, '保存与归档',
         ('项目标准、原文引文和作者决定保存在项目浏览器记录中。',
          '技术流程图、制图源码、执行技能及通用错误记录保存在维护目录。',
          '服务错误按日期与固定代码归档至服务器私有记录本。'),
         heading=SLATE, title_size=32, body_size=27)
    draw.line((96, 2802, 1824, 2802), fill=RULE, width=2)
    text(96, 2836, 'AIM-STEP', 26, BODY, bold=True)
    text(1085, 2836, '2026-11-23  /  Eligibility Criteria release 59', 25, BODY, width=739)

    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, optimize=True)


if __name__ == '__main__':
    render(Path(__file__).resolve().parents[1] / 'figures' / 'eligibility-workflow.png')
