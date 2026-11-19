#!/usr/bin/env python3
"""Build the Search strategy diagram reader from its reviewed assets and manifest."""
import html
import json
from pathlib import Path
import re
import shutil
import struct
import zipfile

ROOT=Path(__file__).resolve().parents[1]
CSS=re.search(r'<style>(.*?)</style>',(ROOT/'pilot-main-screening-flowcharts.html').read_text(),re.S).group(1)

def esc(value):return html.escape(str(value),quote=True)
def png_size(path):
 raw=path.read_bytes()
 if raw[:8]!=b'\x89PNG\r\n\x1a\n':raise ValueError('Not a PNG: '+str(path))
 return struct.unpack('>II',raw[16:24])

def build():
 slug='search-strategy'
 public=ROOT/'docs'/(slug+'-flowcharts');meta=json.loads((public/'manifest.json').read_text())
 title=meta['title'];page_name=slug+'-flowcharts.html';zip_name=slug+'-flowcharts.zip'
 source='https://github.com/AIM-STEP/living-evidence/blob/'+meta['sourceCommit']+'/'
 code='search-strategy.html'
 sections=[];nav=[]
 for i,c in enumerate(meta['charts'],1):
  stem=c['stem'];base=ROOT/c['archive'];image=base/'figures'/(stem+'.png');mermaid=base/'sources'/(stem+'.mmd')
  width,height=png_size(image)
  for p in (image,mermaid):shutil.copy2(p,public/p.name)
  nav.append(f'<a href="#{stem}">{i} {esc(c["title"])}</a>')
  rows=''.join('<tr><th scope="row">'+esc(k)+'</th><td>'+esc(v)+'</td></tr>' for k,v in c['details'])
  sections.append(f'''<section class="diagram" id="{stem}" aria-labelledby="title-{stem}">
<h2 id="title-{stem}">{i}. {esc(c['title'])}</h2><p>{esc(c['description'])}</p>
<div class="actions"><a href="docs/{slug}-flowcharts/{stem}.png" target="_blank" rel="noopener">打开原图／放大</a><a href="docs/{slug}-flowcharts/{stem}.png" download>下载 PNG</a><a href="docs/{slug}-flowcharts/{stem}.mmd" download>下载可编辑流程源码</a></div>
<a class="image-link" href="docs/{slug}-flowcharts/{stem}.png" target="_blank" rel="noopener" aria-label="打开{esc(title+'：'+c['title'])}完整原图"><img src="docs/{slug}-flowcharts/{stem}.png" width="{width}" height="{height}" alt="{esc(title+'：'+c['title']+'。'+c['description'])}" {'fetchpriority="high"' if i==1 else 'loading="lazy"'}></a>
<details><summary>技术细节与代码依据（文字版）</summary><table><caption>{esc(c['title'])}技术细节</caption><tbody>{rows}</tbody></table><p class="code-ref">对应函数：<code>{esc(c['functions'])}</code>。<a href="{source+code}">查看该版本页面代码</a> · <a href="{source}app/eligibility-library.js">标准库代码</a> · <a href="{source}app/search-criteria-editor.js">跨工作区保存代码</a>。</p></details>
</section>''')
 note='只有 PubMed 与 Europe PMC 支持本页直接检索；其他数据库为策略草稿及外部执行。MeSH 词条成员身份、词条命中数和给定参考集覆盖均不等于独立检索性能证明。'
 page=f'''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>{esc(title)} 技术流程图 · AIM-STEP</title><style>{CSS}</style></head><body><main>
<h1>{esc(title)} 技术流程图</h1><p class="intro">四张图按 1–4 阅读：{esc(meta['subtitle'])}。点击图片或“打开原图／放大”查看完整 PNG；手机可双指放大。每图下方可展开文字技术细节及代码依据，无需安装 Mermaid。</p>
<p><a href="screening-source-flowcharts.html">Screening source 图册</a> · <a href="pilot-main-screening-flowcharts.html">Pilot 与 Main screening 图册</a> · <a href="https://github.com/AIM-STEP/living-evidence/tree/main/technical-roadmaps">GitHub 技术路线图档案</a></p>
<a class="download" href="docs/{slug}-flowcharts/{zip_name}" download>下载本模块四张图片、文字细节与可编辑源码（ZIP）</a>
<nav aria-label="流程图目录">{''.join(nav)}</nav>
{''.join(sections)}
<p class="note">{esc(note)}图像说明当前实现；文字细节、Mermaid 源码及固定代码版本用于核对精确条件。当前浏览器存储不代表跨设备自动同步；生成、核对和合成样本检查不构成真实综述性能验证。</p>
<footer>依据实现版本 26bd92a · 2026-11-16 · 图片由本会话内置 imagegen 绘制 · <a href="#">返回顶部</a></footer></main></body></html>
'''
 (ROOT/page_name).write_text(page,encoding='utf-8')
 text=title+' 技术流程图\n依据实现：'+meta['sourceCommit']+'；2026-11-16。\n\n'
 text+='在线查看：https://aimsetp.com/'+page_name+'\n本地查看：解压后用浏览器打开 index.html。图片与技术细节可离线阅读，Mermaid可单独编辑。\n\n'
 for i,c in enumerate(meta['charts'],1):text+=str(i)+'. '+c['title']+'\n'+c['description']+'\n'
 text+='\n'+note+'\n图像由本会话内置imagegen绘制；精确逻辑以配套文字与固定版本源码为准。\n'
 (public/'README.txt').write_text(text,encoding='utf-8')
 offline=page.replace('docs/'+slug+'-flowcharts/','')
 for p in ['screening-source-flowcharts.html','pilot-main-screening-flowcharts.html']:
  offline=offline.replace('href="'+p+'"','href="https://aimsetp.com/'+p+'"')
 offline=re.sub(r'<a class="download"[^>]*>.*?</a>','',offline)
 with zipfile.ZipFile(public/zip_name,'w',zipfile.ZIP_DEFLATED) as z:
  z.writestr('index.html',offline)
  for p in sorted(public.iterdir()):
   if p.is_file() and p.suffix in {'.png','.mmd','.txt','.json'}:z.write(p,p.name)
 archive=ROOT/'technical-roadmaps'/slug
 (archive/'README.md').write_text(f'# {title} 技术路线图\n\n[2026-11-16 四张详细流程图](2026-11-16/README.md)描述实现版本 `26bd92a`。\n\n[浏览器在线查看、放大和下载](https://aimsetp.com/{page_name})\n',encoding='utf-8')
 doc=f'# {title} 技术流程图 · 2026-11-16\n\n依据实现：`{meta["sourceCommit"]}`。图片由本会话内置 imagegen 绘制并逐图核对；配套源码及文字细节说明实际分支与范围。\n\n| 图 | PNG | 可编辑流程 | 内容 |\n|---|---|---|---|\n'
 for i,c in enumerate(meta['charts'],1):doc+=f'| {i} {c["title"]} | [图片](figures/{c["stem"]}.png) | [Mermaid](sources/{c["stem"]}.mmd) | {c["description"]} |\n'
 doc+='\n'
 for i,c in enumerate(meta['charts'],1):
  doc+=f'## {i}. {c["title"]}\n\n![{title}：{c["title"]}](figures/{c["stem"]}.png)\n\n'
  doc+='\n'.join('- **'+k+'**：'+v for k,v in c['details'])+'\n\n'
 doc+=f'## 查看、下载与依据\n\n- [在线阅读及放大；每图可展开文字细节](https://aimsetp.com/{page_name})\n- [下载四图及离线阅读包](https://aimsetp.com/docs/{slug}-flowcharts/{zip_name})\n- [绘图提示词及校正记录](drawing-prompts.txt)\n- [对应页面源码]({source+code})\n\n{note}\n\n本次更新只新增技术文档与图册，未修改业务判断、数据库配置或模型服务。所有规则数值是该版本的软件边界，不据此宣称真实任务性能。\n'
 (archive/'2026-11-16/README.md').write_text(doc,encoding='utf-8')
 print('Built',page_name,'and four-diagram offline ZIP.')

if __name__=='__main__':
 build()
