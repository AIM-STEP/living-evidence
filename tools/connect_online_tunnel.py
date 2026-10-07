#!/usr/bin/env python3
"""Install a separate AIM-STEP tunnel without modifying other cloudflared services.
Accepts a token OR the whole Cloudflare install command; never executes that input.
Run interactively on the Mac Studio: python3 tools/connect_online_tunnel.py
"""
import base64
import getpass
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[2]
LABEL = 'com.aimstep.online-tunnel'

def extract_token(value):
    candidates = re.findall(r'(?<![A-Za-z0-9_=-])(eyJ[A-Za-z0-9_+/=-]{80,})(?![A-Za-z0-9_=-])', value)
    for token in candidates:
        try:
            data=json.loads(base64.b64decode(token + '=' * (-len(token) % 4)))
            uuid.UUID(data['t'])
            if isinstance(data.get('a'),str) and isinstance(data.get('s'),str):return token
        except (ValueError,KeyError,TypeError):pass
    raise ValueError('未找到有效 Tunnel token。请复制 Cloudflare 的完整安装命令后重试。')

def main():
    binary=shutil.which('cloudflared')
    if not binary:raise SystemExit('cloudflared 未安装。')
    value=getpass.getpass('粘贴 aimstep-mac-studio 的完整安装命令或 token，按回车（内容不会显示）：\n')
    try:token=extract_token(value)
    except ValueError as e:raise SystemExit(str(e))
    private=ROOT/'private';private.mkdir(exist_ok=True)
    token_path=private/'aimstep-tunnel.token'
    fd=os.open(token_path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(fd,'w') as f:f.write(token)
    token_path.chmod(0o600)
    logs=ROOT/'living-evidence'/'logs';logs.mkdir(exist_ok=True)
    agent=Path.home()/'Library/LaunchAgents'/f'{LABEL}.plist';agent.parent.mkdir(parents=True,exist_ok=True)
    data={'Label':LABEL,'ProgramArguments':[binary,'tunnel','--no-autoupdate','--protocol','http2','run','--token-file',str(token_path)],'RunAtLoad':True,'KeepAlive':True,'ThrottleInterval':15,'StandardOutPath':str(logs/'online-tunnel.log'),'StandardErrorPath':str(logs/'online-tunnel.log')}
    agent.write_bytes(plistlib.dumps(data));agent.chmod(0o600)
    domain='gui/'+str(os.getuid())
    exists=subprocess.run(['launchctl','print',domain+'/'+LABEL],capture_output=True).returncode==0
    if exists:subprocess.run(['launchctl','bootout',domain+'/'+LABEL],check=True)
    subprocess.run(['launchctl','bootstrap',domain,str(agent)],check=True)
    print('AIM-STEP 独立连接器已启动，不需要保持终端打开。')
    print('Cloudflare 中将 aimstep-mac-studio 路由配置为 api.aimsetp.com → http://127.0.0.1:8767。')
    print('不要转发 8765 或 11434。下一步请检查 Tunnel 状态是否为 Healthy。')

if __name__=='__main__':main()
