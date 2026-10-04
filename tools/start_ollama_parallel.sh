#!/bin/zsh
# Make the Ollama app serve several requests at once (OLLAMA_NUM_PARALLEL), so
# Title and abstract screening can send AI_WORKERS requests together.
# The Ollama app starts its server with its own environment and ignores
# `launchctl setenv`, so the app is restarted with the variable set.
# Measured on an M3 Ultra with gemma4:31b-it-q8_0: 4 in parallel gives about
# 1.6 times the throughput of 1 (10.5 s -> 6.6 s per screening reading).
#
#   tools/start_ollama_parallel.sh        # restart Ollama only if needed
#   PARALLEL=2 tools/start_ollama_parallel.sh
# Run at login by ~/Library/LaunchAgents/com.aimstep.ollama-parallel.plist.
PARALLEL=${PARALLEL:-4}
APP=/Applications/Ollama.app/Contents/MacOS/Ollama
current() {
  local pid=$(pgrep -f "Ollama.app/Contents/Resources/ollama serve" | head -1)
  [[ -n $pid ]] && ps -E -p $pid -o command= | tr ' ' '\n' | sed -n 's/^OLLAMA_NUM_PARALLEL=//p'
}
# At login the app may still be starting; give it time.
for i in {1..60}; do pgrep -f "Ollama.app/Contents/Resources/ollama serve" >/dev/null && break; sleep 2; done
if [[ "$(current)" == "$PARALLEL" ]]; then echo "Ollama already serves $PARALLEL requests in parallel."; exit 0; fi
pkill -x Ollama; pkill -f "Ollama.app/Contents/Resources/ollama"
for i in {1..30}; do pgrep -f "Ollama.app" >/dev/null || break; sleep 1; done
OLLAMA_NUM_PARALLEL=$PARALLEL nohup "$APP" >/dev/null 2>&1 &
disown
for i in {1..60}; do curl -s -m 2 http://127.0.0.1:11434/api/version >/dev/null && break; sleep 1; done
sleep 2
echo "Ollama restarted; OLLAMA_NUM_PARALLEL=$(current)"
