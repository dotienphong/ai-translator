import json, statistics as st, sys, glob, os
from collections import defaultdict
from sacrebleu.metrics import CHRF
S = os.environ.get('AB_DIR', os.path.dirname(os.path.abspath(__file__)))  # thư mục chứa mt-<nhãn>/ do latency-bench mt-eval ghi
TS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '2026-09-29-mt-benchmark', 'testset.jsonl')
ref = {r['id']: r for r in map(json.loads, open(TS, encoding='utf-8'))}
chrf = CHRF(word_order=2)
def load(tag):
    f = glob.glob(f'{S}/mt-{tag}/*-plain.jsonl')[0]
    return {r['id']: r for r in map(json.loads, open(f, encoding='utf-8'))}
def pct(xs, p): xs = sorted(xs); return xs[min(len(xs)-1, int(p*len(xs)))]
for model in ['hy', 'lmt']:
    o, n = load(f'{model}-old'), load(f'{model}-new')
    ids = sorted(set(o) & set(n))
    print(f'\n##### {model}: {len(ids)} câu chung (cũ {len(o)}, mới {len(n)})')
    same = sum(o[i]['hyp'] == n[i]['hyp'] for i in ids)
    print(f'bản dịch giống hệt: {same}/{len(ids)} = {100*same/len(ids):.1f}%')
    bydir = defaultdict(list)
    for i in ids: bydir[ref[i]['dir']].append(i)
    print(f'{"chiều":16}{"n":>4}{"chrF++ cũ":>11}{"chrF++ mới":>12}{"Δ":>7}{"giống":>7}')
    tot = {'old': [], 'new': []}
    for d, xs in sorted(bydir.items()):
        r = [ref[i]['ref'] for i in xs]
        a = chrf.corpus_score([o[i]['hyp'] for i in xs], [r]).score
        b = chrf.corpus_score([n[i]['hyp'] for i in xs], [r]).score
        s = sum(o[i]['hyp'] == n[i]['hyp'] for i in xs)
        print(f'{d:16}{len(xs):>4}{a:>11.2f}{b:>12.2f}{b-a:>+7.2f}{s:>5}/{len(xs)}')
    for name, dd in (('cũ', o), ('mới', n)):
        t = [dd[i]['total_ms'] for i in ids]; f = [dd[i]['first_token_ms'] for i in ids]
        ct = sum(dd[i]['completion_tokens'] for i in ids); ms = sum(dd[i]['total_ms'] for i in ids)
        bad = sum(dd[i]['status'] != 'done' for i in ids); retry = sum(dd[i].get('attempts', 1) > 1 for i in ids)
        print(f'{name}: total_ms p50 {st.median(t):.0f} p90 {pct(t,.9):.0f} | first_token p50 {st.median(f):.0f} p90 {pct(f,.9):.0f} | {1000*ct/ms:.0f} token/s | không done {bad} | thử lại {retry}')
