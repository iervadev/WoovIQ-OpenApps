"""Regenerate the bundled Italian prompts on macOS using its installed Alice voice."""
import json, subprocess, tempfile
from pathlib import Path
root = Path(__file__).resolve().parents[1]
prompts = json.loads((root / 'audio/prompts.json').read_text())
with tempfile.TemporaryDirectory() as tmp:
    for name, text in prompts.items():
        raw = str(Path(tmp) / f'{name}.aiff')
        subprocess.run(['say', '-v', 'Alice', '-r', '175', '-o', raw, text], check=True)
        subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac ', '-b', '32000', raw, str(root / 'audio' / f'{name}.m4a')], check=True)
print(f'Generated {len(prompts)} Italian AAC clips.')
