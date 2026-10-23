"""Gera o cenário vetorial original do Vsync; nenhum asset de outro client é usado."""
from pathlib import Path
import random
random.seed(21)
root=Path(__file__).resolve().parents[1]
p=root/'src/assets';p.mkdir(parents=True,exist_ok=True)
art=['<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="600" viewBox="0 0 1400 600"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#1b1135"/><stop offset=".65" stop-color="#71546e"/><stop offset="1" stop-color="#251c3a"/></linearGradient><linearGradient id="water" x2=".8" y2="1"><stop stop-color="#745a91"/><stop offset="1" stop-color="#211830"/></linearGradient><linearGradient id="stem"><stop stop-color="#273b31"/><stop offset=".5" stop-color="#596d4b"/><stop offset="1" stop-color="#243b2e"/></linearGradient><radialGradient id="glow"><stop stop-color="#d4bdff" stop-opacity=".35"/><stop offset="1" stop-color="#b297e8" stop-opacity="0"/></radialGradient></defs><rect width="1400" height="600" fill="url(#sky)"/><ellipse cx="1050" cy="155" rx="260" ry="230" fill="url(#glow)"/><path fill="#ead8e4" opacity=".55" d="M1030 94h42v10h10v42h-10v10h-42v-10h-10v-42h10Z"/>']
for _ in range(75):
 x=random.randrange(450,1400);y=random.randrange(20,230)
 art.append(f'<rect x="{x}" y="{y}" width="{random.choice([1,2,3])}" height="2" fill="#dec2f4" opacity="{random.uniform(.15,.6):.2f}"/>')
for depth,base,color in [(0,325,'#40324e'),(1,360,'#352a43'),(2,405,'#232c35')]:
 points=['0,600','0,'+str(base)]
 for x in range(0,1450,40):
  h=base-random.randrange(0,110)
  points.extend([f'{x},{h}',f'{x+40},{h}'])
 points.extend(['1400,600'])
 art.append(f'<polygon points="{" ".join(points)}" fill="{color}"/>')
art.append('<path d="M700 355h200v35h-72v32h-90v35H620v40H430v45H200v58h950l-68-83-121-73-87-50Z" fill="url(#water)"/>')
for _ in range(35):
 x=random.randrange(280,1050);y=random.randrange(390,600)
 art.append(f'<rect x="{x}" y="{y}" width="{random.randrange(12,68)}" height="2" fill="#bd9dd4" opacity=".13"/>')
for i,x in enumerate([20,70,130,190,265,350,420,530,600,1130,1195,1250,1325,1380]):
 height=random.randrange(210,440);bottom=random.randrange(420,600);width=random.randrange(12,26)
 for seg in range(height//45):
  y=bottom-45*(seg+1)
  art.append(f'<rect x="{x}" y="{y}" width="{width}" height="43" fill="url(#stem)"/><rect x="{x-2}" y="{y+39}" width="{width+4}" height="4" fill="#21382b"/><rect x="{x+2}" y="{y+2}" width="3" height="34" fill="#8c9860" opacity=".15"/>')
  if seg%2==0:
   for side in [-1,1]:
    for q in range(3):
     dx=side*(18+q*13);yy=y-14-q*7
     art.append(f'<path d="M{x+width//2} {y+7}l{dx} -18h{side*22}v-8h{-side*10}l{-dx} 18Z" fill="{random.choice(["#2d4633","#38523b","#52633e","#3e503b"])}"/>')
for x,y,w,h,col in [(0,540,260,60,'#172524'),(0,500,150,40,'#2e3c2d'),(1140,460,260,140,'#192a26'),(1220,420,180,40,'#34412e'),(1070,540,100,60,'#22362b'),(230,570,110,30,'#27372b')]:
 art.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{col}"/><rect x="{x}" y="{y}" width="{w}" height="6" fill="#556044" opacity=".5"/>')
for _ in range(30):
 x=random.randrange(600,1370);y=random.randrange(230,550)
 art.append(f'<rect x="{x}" y="{y}" width="3" height="3" fill="#c8aadf" opacity="{random.uniform(.1,.4):.2f}"/>')
art.append('<rect width="1400" height="600" fill="#4c176b" opacity=".12"/></svg>')
(p/'bamboo.svg').write_text(''.join(art))
print('Cenário original gerado.')
