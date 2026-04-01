"""
Agent 启动器。
绕过 Node.js child_process 在 Cursor 沙箱环境下的 ENOENT 问题，
用 Python subprocess 来执行 agent CLI 的 --print 模式。

支持 worktree 沙箱模式：在隔离目录操作，不影响用户当前分支。
"""
import subprocess
import sys
import os
import json

def main():
    if len(sys.argv) < 3:
        print("Usage: pty_wrapper.py <agent_binary> <prompt> [options_json]")
        sys.exit(1)

    agent_bin = sys.argv[1]
    prompt = sys.argv[2]
    options = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}

    cmd = [
        agent_bin,
        '--print',
        '--force',
        '--trust',
        '--output-format', options.get('outputFormat', 'text'),
    ]

    if options.get('model'):
        cmd.extend(['--model', options['model']])

    if options.get('continue'):
        cmd.append('--continue')

    if options.get('worktree'):
        cmd.extend(['--worktree', options['worktree']])

    if options.get('worktreeBase'):
        cmd.extend(['--worktree-base', options['worktreeBase']])

    cmd.append(prompt)

    env = os.environ.copy()
    env['TERM'] = 'xterm-256color'

    result = subprocess.run(cmd, env=env)
    sys.exit(result.returncode)

if __name__ == '__main__':
    main()
