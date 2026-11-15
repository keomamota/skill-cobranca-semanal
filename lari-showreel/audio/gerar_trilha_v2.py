"""Gera assets/trilha.mp3 (61,32 s, 111 BPM) com música e efeitos sincronizados ao vídeo. Determinístico (semente fixa)."""
import numpy as np, wave, subprocess, os
SR = 44100; DUR = 61.32; N = int(SR * DUR); BEAT = 0.54
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)

def put(buf, t, x, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N or i < 0: return
    x = x[: N - i]
    l = gain * (1 - max(pan, 0)); r = gain * (1 + min(pan, 0))
    L[i:i + len(x)] += x * l; R[i:i + len(x)] += x * r

def env(n, a=0.002, d=0.2):
    t = np.arange(n) / SR
    return np.minimum(t / a, 1) * np.exp(-t / d)

def band(noise, lo, hi):
    f = np.fft.rfft(noise); fr = np.fft.rfftfreq(len(noise), 1 / SR)
    f[(fr < lo) | (fr > hi)] = 0
    return np.fft.irfft(f, len(noise))

def kick(g=1.0):
    n = int(0.45 * SR); t = np.arange(n) / SR
    ph = 2 * np.pi * np.cumsum(45 + 110 * np.exp(-t / 0.035)) / SR
    return np.sin(ph) * np.exp(-t / 0.16) * g
def snare(g=1.0):
    n = int(0.25 * SR); t = np.arange(n) / SR
    return (band(rng.standard_normal(n), 1500, 9000) * np.exp(-t / 0.07) * 0.9 + np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05) * 0.5) * g
def hat(g=1.0, d=0.03):
    n = int(0.12 * SR); t = np.arange(n) / SR
    return band(rng.standard_normal(n), 7000, 16000) * np.exp(-t / d) * g
def tone(f, dur, shape="tri", d=0.25, g=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    ph = (f * t) % 1.0
    w = 2 * np.abs(2 * ph - 1) - 1 if shape == "tri" else (2 * ph - 1 if shape == "saw" else np.sign(np.sin(2 * np.pi * f * t)))
    return w * env(n, 0.003, d) * g
def whoosh(dur=0.5, g=1.0, up=True):
    n = int(dur * SR); t = np.arange(n) / SR
    x = band(rng.standard_normal(n), 400, 9000)
    e = (t / dur) ** 2 if up else (1 - t / dur) ** 2
    return x * e * np.minimum((dur - t) / 0.05, 1) * g * 0.9
def pop(f=700, g=1.0):
    n = int(0.16 * SR); t = np.arange(n) / SR
    ph = 2 * np.pi * np.cumsum(f * (1 + 1.2 * np.exp(-t / 0.03))) / SR
    return np.sin(ph) * np.exp(-t / 0.05) * g
def tick(g=1.0, f=2400):
    n = int(0.04 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * t) * np.exp(-t / 0.008) * g
def ding(g=1.0):
    n = int(0.9 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 988 * t) + 0.5 * np.sin(2 * np.pi * 1480 * t)) * np.exp(-t / 0.25) * g
def boom(g=1.0):
    n = int(1.2 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 52 * t) * np.exp(-t / 0.45) + band(rng.standard_normal(n), 3000, 12000) * np.exp(-t / 0.35) * 0.35) * g

BAR = 4 * BEAT
K = 1.08                       # fator das cenas esticadas (1/0.92593)
WIPES = [6.58, 15.22, 23.86, 34.66, 40.18, 45.70, 51.22, 58.42]   # = index.html (corte + 0,1 s)
A = [55.0, 55.0, 65.41, 55.0, 82.41, 55.0, 73.42, 65.41]
PENT = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0]
END_DRUMS = 56.16              # bateria para antes do quadro final da KRM
for bar in range(int(DUR / BAR) + 1):
    t0 = bar * BAR
    full = t0 >= BAR
    for b in range(4):
        tb = t0 + b * BEAT
        if full and t0 < END_DRUMS: put(L, tb, kick(0.9), 0.9)
        if t0 >= 2 * BAR and t0 < END_DRUMS and b in (1, 3): put(L, tb, snare(0.55), 0.55, 0.05)
    for e in range(8):
        te = t0 + e * BEAT / 2
        if t0 >= BAR and t0 < END_DRUMS + BAR / 2:
            put(L, te, hat(0.18 if e % 2 else 0.1), 1, 0.3 if e % 2 else -0.3)
            nf = A[(bar * 8 + e) % len(A)]
            put(L, te, tone(nf, 0.22, "saw", 0.18, 0.28), 1)
    arp = (8.64 <= t0 < 12.96) or (15.12 <= t0 < 23.76) or (34.56 <= t0 < END_DRUMS)
    if arp:
        for s in range(16):
            ts = t0 + s * BEAT / 4
            f = PENT[(s * 3 + bar) % len(PENT)] * (2 if s % 4 == 3 else 1)
            put(L, ts, tone(f, 0.2, "tri", 0.09, 0.16), 1, -0.4 if s % 2 else 0.4)
# cada transição: subida de ruído que termina no corte, impacto no corte
for i, T in enumerate(WIPES):
    big = 1.0 if i in (0, 1, 2, 3, 6, 7) else 0.6
    put(L, T - 0.5, whoosh(0.5, 0.85 * big, True), 1)
    put(L, T, boom(0.9 * big), 1)
    put(L, T, band(rng.standard_normal(int(0.8 * SR)), 5000, 14000) * np.exp(-np.arange(int(0.8 * SR)) / SR / 0.3) * 0.5 * big, 1)
# efeitos das animações
def ping(t, vol=0.30):   # som de mensagem do WhatsApp (duas notas)
    for f, dt in [(987.8, 0), (1318.5, 0.09)]:
        n = int(0.22 * SR); tt = np.arange(n) / SR
        s = np.sin(2 * np.pi * f * tt) * np.exp(-tt * 16) * (1 - np.exp(-tt * 900))
        put(L, t + dt, s, vol)
for t in [7.99, 10.10, 11.34, 16.09, 18.25, 19.01, 25.92]: ping(t)
S = []
S += [(0.0, 'w'), (0.12, 'w'), (2.0, 'p'), (2.1, 'w'), (2.6, 'p2'), (3.15, 'th'), (3.6, 'th'), (4.05, 'th')]   # abertura (s1)
S += [(22.8, 'p'), (23.15, 'w'), (23.45, 'p'), (23.57, 'p2'), (23.69, 'p'), (23.81, 'p2'), (24.1, 'p'), (24.95, 'p2')]   # s4
S += [(26.0 + 0.5 * i, 'tk') for i in range(5)] + [(28.4, 'w'), (28.9, 'p'), (29.55, 'ding')]
S = [(t * K, k) for t, k in S]
# s5: contadores dos números (contagem com ticks e "ding" ao chegar)
for k0 in (36.23, 41.70, 47.22):
    S += [(k0 + 0.065 * i + 0.002 * i * i, 'tk') for i in range(12)] + [(k0 + 1.0, 'ding')]
# s6: logo (efeitos da cena antiga, deslocados para 51,12)
S6 = [(40.15, 'p'), (40.95, 'th'), (41.07, 'th'), (41.19, 'th'), (41.31, 'th'), (41.55, 'p2'), (41.95, 'w'), (42.55, 'w'), (43.2, 'ding')]
S += [((t - 40.0) * K + 51.12, k) for t, k in S6]
for t, k in S:
    if k == 'w': put(L, t, whoosh(0.35, 0.5, True), 1)
    elif k == 'th': put(L, t, kick(0.8)[: int(0.25 * SR)], 0.8)
    elif k == 'p': put(L, t, pop(700, 0.55), 1)
    elif k == 'p2': put(L, t, pop(1000, 0.5), 1)
    elif k == 'tk': put(L, t, tick(0.35), 1)
    elif k == 'ding': put(L, t, ding(0.4), 1)
# quadro final da KRM: acorde de Lá menor que respira até o fim
for f in (110.0, 164.81, 220.0, 261.63, 329.63):
    put(L, 58.42, tone(f, 2.9, "tri", 1.1, 0.12), 1)
put(L, 58.42, boom(0.8), 1)
d = int(0.012 * SR)
R[:] = L
R[d:] = L[:-d] * 0.92
M = np.stack([L, R], 1)
fin = int(0.05 * SR); fout = int(1.8 * SR)
M[:fin] *= np.linspace(0, 1, fin)[:, None]; M[-fout:] *= np.linspace(1, 0, fout)[:, None]
M = np.tanh(M * 0.9)
M = M / np.max(np.abs(M)) * 0.8
pcm = (M * 32767).astype(np.int16)
os.makedirs('assets', exist_ok=True)
with wave.open('assets/trilha.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', 'assets/trilha.wav', '-b:a', '192k', 'assets/trilha.mp3'], check=True)
os.remove('assets/trilha.wav')
print('ok', os.path.getsize('assets/trilha.mp3'))
