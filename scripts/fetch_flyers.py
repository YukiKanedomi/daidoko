# -*- coding: utf-8 -*-
"""トクバイから近所の店のチラシ画像を取ってきて、Claude が読める大きさに分割して保存する。
使い方: python scripts/fetch_flyers.py [--for YYYY-MM-DD]
出力: work/flyers/latest/ に <store>-<n>-q<1-4>.jpg と manifest.json（店・期間・元URL）
方針: 取れなければ黙って空の manifest を書く（ジョブは止めない）。
"""
import io, json, os, re, sys, html, datetime, urllib.request, urllib.parse
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, 'work', 'flyers', 'latest')
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36'}
STORES = [
    {"id": "iy-ario", "name": "イトーヨーカドー アリオ橋本店", "chain": "イトーヨーカドー", "shop": "8900"},
    {"id": "lopia-mewe", "name": "ロピア ミウィ橋本店", "chain": "ロピア", "shop": "29831"},
    {"id": "aeon-hashimoto", "name": "イオン橋本店", "chain": "イオン", "shop": "7418"},
]

def get(url, binary=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read() if binary else r.read().decode('utf-8', 'replace')

def parse_period(alt):
    # 例: 2026年9月12日〜13日までのチラシ / 2026年9月9日〜23日 / 2026年8月28日〜10月31日
    m = re.search(r'(\d{4})年(\d{1,2})月(\d{1,2})日〜(?:(\d{1,2})月)?(\d{1,2})日', alt)
    if not m: return None
    y, m1, d1, m2, d2 = m.groups()
    start = datetime.date(int(y), int(m1), int(d1))
    end = datetime.date(int(y), int(m2 or m1), int(d2))
    if end < start: end = datetime.date(int(y) + 1, end.month, end.day)
    return start, end

def leaflets_for(store):
    chain = urllib.parse.quote(store['chain'])
    page = get(f"https://tokubai.co.jp/{chain}/{store['shop']}")
    ids = []
    for i in re.findall(r'/leaflets/(\d+)', page):
        if i not in ids: ids.append(i)
    if not ids: return []
    lp = get(f"https://tokubai.co.jp/{chain}/{store['shop']}/leaflets/{ids[0]}")
    m = re.search(r"id='view_state'", lp) or re.search(r'id="view_state"', lp)
    # view_state の JSON は HTML エスケープされている
    blob = html.unescape(lp)
    found = []
    for mm in re.finditer(r'"id":(\d+),"high_resolution_image_url":"(https://image\.tokubai\.co\.jp/images/[^"]+?)","alt":"([^"]*)"', blob):
        lid, url, alt = mm.groups()
        url = url.replace('\\/', '/')
        if lid not in [f['id'] for f in found]:
            found.append({"id": lid, "url": url, "alt": alt})
    return found

def main():
    target = datetime.date.today()
    if '--for' in sys.argv: target = datetime.date.fromisoformat(sys.argv[sys.argv.index('--for') + 1])
    # 土曜の買い出しに効くチラシ = 次の土曜（今日が土曜ならきょう）を含む期間
    sat = target + datetime.timedelta(days=(5 - target.weekday()) % 7)
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT): os.remove(os.path.join(OUT, f))
    manifest = {"fetched": datetime.datetime.now().isoformat(timespec='minutes'), "for_saturday": sat.isoformat(), "stores": []}
    for st in STORES:
        entry = {"id": st['id'], "name": st['name'], "leaflets": [], "error": None}
        try:
            for lf in leaflets_for(st):
                per = parse_period(lf['alt'])
                if not per: continue
                start, end = per
                # 土曜を含む、または土曜の前後2日にかかるもの。長期（30日超）の企画チラシは除く
                if not (start - datetime.timedelta(days=2) <= sat <= end + datetime.timedelta(days=1)): continue
                if (end - start).days > 30: continue
                n = len(entry['leaflets']) + 1
                big = lf['url'].replace('/o=true/', '/w=1800/')
                data = get(big, binary=True)
                im = Image.open(io.BytesIO(data)).convert('RGB')
                w, h = im.size
                quads = [(0, 0, w // 2, h // 2), (w // 2, 0, w, h // 2), (0, h // 2, w // 2, h), (w // 2, h // 2, w, h)]
                files = []
                for q, box in enumerate(quads, 1):
                    fn = f"{st['id']}-{n}-q{q}.jpg"
                    im.crop(box).save(os.path.join(OUT, fn), quality=85)
                    files.append(fn)
                entry['leaflets'].append({"id": lf['id'], "period": lf['alt'], "start": start.isoformat(), "end": end.isoformat(), "source": lf['url'], "files": files})
                if n >= 2: break  # 店ごとに最大2枚
        except Exception as e:
            entry['error'] = str(e)[:120]
        manifest['stores'].append(entry)
        print(st['id'], len(entry['leaflets']), 'leaflets', entry['error'] or '')
    io.open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8').write(json.dumps(manifest, ensure_ascii=False, indent=2))
    print('saturday:', sat)

if __name__ == '__main__':
    main()
