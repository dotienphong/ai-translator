## COMET (wmt22-comet-da, higher is better)

| Model | en->vi | vi->en | vi->zh | vi->ja | vi->ko | All 320 |
|---|---|---|---|---|---|---|
| nllb-600m | 0.724 | 0.769 | 0.683 | 0.716 | 0.754 | **0.736** |
| hymt1.5-1.8b | 0.839 | 0.815 | 0.834 | 0.849 | 0.847 | **0.833** |
| hymt2-1.8b | 0.840 | 0.829 | 0.831 | 0.853 | 0.843 | **0.837** |
| madlad-3b | 0.781 | 0.808 | 0.735 | 0.758 | 0.763 | **0.779** |

## chrF++ (chrF for zh/ja)

| Model | en->vi | vi->en | vi->zh | vi->ja | vi->ko |
|---|---|---|---|---|---|
| nllb-600m | 40.4 | 42.2 | 13.4 | 13.3 | 16.9 |
| hymt1.5-1.8b | 44.5 | 44.9 | 26.5 | 20.4 | 21.0 |
| hymt2-1.8b | 47.6 | 47.7 | 25.7 | 23.4 | 24.7 |
| madlad-3b | 42.7 | 46.6 | 18.4 | 17.6 | 17.7 |

## Paired bootstrap: Hy-MT2 minus other model (COMET, 95% CI)

| Other model | Scope | Diff | 95% CI |
|---|---|---|---|
| nllb-600m | All 320 | +0.102 | [+0.090, +0.114] |
| nllb-600m | en->vi | +0.116 | [+0.096, +0.137] |
| nllb-600m | vi->en | +0.060 | [+0.043, +0.077] |
| nllb-600m | vi->zh | +0.148 | [+0.108, +0.188] |
| nllb-600m | vi->ja | +0.137 | [+0.107, +0.168] |
| nllb-600m | vi->ko | +0.089 | [+0.058, +0.121] |
| hymt1.5-1.8b | All 320 | +0.004 | [-0.001, +0.010] |
| hymt1.5-1.8b | en->vi | +0.002 | [-0.013, +0.014] |
| hymt1.5-1.8b | vi->en | +0.014 | [+0.007, +0.022] |
| hymt1.5-1.8b | vi->zh | -0.003 | [-0.015, +0.007] |
| hymt1.5-1.8b | vi->ja | +0.004 | [-0.007, +0.014] |
| hymt1.5-1.8b | vi->ko | -0.004 | [-0.021, +0.013] |
| madlad-3b | All 320 | +0.059 | [+0.049, +0.070] |
| madlad-3b | en->vi | +0.059 | [+0.040, +0.078] |
| madlad-3b | vi->en | +0.021 | [+0.012, +0.030] |
| madlad-3b | vi->zh | +0.095 | [+0.065, +0.131] |
| madlad-3b | vi->ja | +0.094 | [+0.065, +0.129] |
| madlad-3b | vi->ko | +0.080 | [+0.045, +0.120] |

## Output sanity (hyp/ref length ratio flags, empty outputs)

| Model | empty | too long (>2x ref) | too short (<0.4x ref) |
|---|---|---|---|
| nllb-600m | 1 | 4 | 7 |
| hymt1.5-1.8b | 0 | 4 | 0 |
| hymt2-1.8b | 0 | 0 | 0 |
| madlad-3b | 0 | 0 | 2 |

## Speed

| Model | GPU (MPS) s/segment | GPU tok/s | CPU 4 threads 8-bit s/segment | CPU tok/s | CPU peak RAM GB | Runtime (CPU) |
|---|---|---|---|---|---|---|
| nllb-600m | 0.26 | 92.9 | 0.30 | 65.5 | 1.71 | CTranslate2 int8 |
| hymt1.5-1.8b | 1.00 | 37.0 | 0.46 | 73.5 | 3.95 | llama.cpp Q8_0 |
| hymt2-1.8b | 0.90 | 36.7 | 0.45 | 69.0 | 3.95 | llama.cpp Q8_0 |
| madlad-3b | 0.74 | 39.9 | 1.28 | 19.8 | 4.10 | CTranslate2 int8 |

## 8-bit vs full precision (same 30 segments, COMET)

| Model | Full precision (GPU) | 8-bit (CPU) | Diff |
|---|---|---|---|
| nllb-600m | 0.740 | 0.740 | -0.000 |
| hymt1.5-1.8b | 0.834 | 0.831 | -0.003 |
| hymt2-1.8b | 0.857 | 0.850 | -0.006 |
| madlad-3b | 0.820 | 0.819 | -0.001 |

## Everyday sentences (vi->en)

- **Em ơi, cho anh xin hai ly cà phê sữa đá, ít đường nhé.**
  - nllb-600m: Honey, can I get you two glasses of ice cream, some sugar?
  - hymt1.5-1.8b: Hey, can you give me two cups of ice-cold milk coffee, please? With no sugar added, okay?
  - hymt2-1.8b: Hey, could I get two glasses of iced coffee, with little sugar?
  - madlad-3b: Baby, I need two cups of iced coffee with a little sugar.
- **Cho mình hỏi đường ra ga tàu gần nhất đi hướng nào vậy?**
  - nllb-600m: Let me ask you, which way is the nearest train station?
  - hymt1.5-1.8b: Can you tell me the way to the nearest train station? In which direction should I go?
  - hymt2-1.8b: May I ask where the nearest train station is, and in which direction should I go?
  - madlad-3b: Can I ask you where the nearest train station is?
- **Phòng này có máy lạnh không, và giá một đêm là bao nhiêu?**
  - nllb-600m: Does this room have a refrigerator, and how much is it for a night?
  - hymt1.5-1.8b: Does this room have air conditioning? And how much does it cost for one night?
  - hymt2-1.8b: Does this room have a air conditioner? And what is the cost for one night?
  - madlad-3b: Does this room have air conditioning, and how much is it per night?
- **Tôi bị dị ứng với đậu phộng, món này có đậu phộng không?**
  - nllb-600m: I'm allergic to peanuts. Is this a peanut?
  - hymt1.5-1.8b: I’m allergic to peanuts. Does this dish contain peanuts at all?
  - hymt2-1.8b: I am allergic to peanuts. Does this dish contain peanuts?
  - madlad-3b: I'm allergic to beans, is this bean?
- **Chuyến bay của tôi bị hoãn ba tiếng, tôi có được bồi thường không?**
  - nllb-600m: My flight was delayed for three hours, can I get compensation?
  - hymt1.5-1.8b: My flight was delayed by three hours. Will I get any compensation for this?
  - hymt2-1.8b: My flight was delayed by three hours—am I entitled to compensation?
  - madlad-3b: My flight was delayed three hours, do I get compensation?
- **Anh đi thẳng khoảng 200 mét rồi rẽ trái ở ngã tư thứ hai là tới.**
  - nllb-600m: You go straight about 200 meters and turn left in the second quarter.
  - hymt1.5-1.8b: He walked straight for about 200 meters, and then turned left at the second intersection to get there.
  - hymt2-1.8b: He walked straight for about 200 meters, then turned left at the second intersection—there he was.
  - madlad-3b: You go straight for about 200 meters and turn left at the second intersection and you're there.
- **Hôm nay kẹt xe quá, chắc tôi đến trễ khoảng mười lăm phút.**
  - nllb-600m: I'm so stuck today, I must be about 15 minutes late.
  - hymt1.5-1.8b: Today, there’s a lot of traffic. I guess I’ll be late by about fifteen minutes.
  - hymt2-1.8b: Today there’s too much traffic; I probably will be late by about fifteen minutes.
  - madlad-3b: I'm in a traffic jam today, I'm probably about fifteen minutes late.
- **Bác sĩ ơi, tôi bị sốt từ tối qua và đau họng dữ lắm.**
  - nllb-600m: Doctor, I've had a fever since last night and a bad sore throat.
  - hymt1.5-1.8b: Doctor, I’ve been having a fever since last night, and my throat hurts terribly.
  - hymt2-1.8b: Doctor, I have a fever since last night and my throat is very painful.
  - madlad-3b: Doctor, I've had a fever since last night and a sore throat.
- **Cái áo này có size lớn hơn không? Bớt chút được không chị?**
  - nllb-600m: Is this shirt bigger?
  - hymt1.5-1.8b: Does this dress come in a larger size? Could you make it a little smaller, please?
  - hymt2-1.8b: Is this shirt a larger size? Could it be a little smaller, dear?
  - madlad-3b: Is this shirt a size bigger?
- **Mưa to quá, ướt như chuột lột luôn.**
  - nllb-600m: It's raining so hard, it's wet like a rat.
  - hymt1.5-1.8b: It’s raining so hard that I’m completely wet, like a rat after being skinned.
  - hymt2-1.8b: It’s raining so hard; I’m completely wet like a mouse.
  - madlad-3b: It's raining so hard, it's wet like a rat.
- **Tui hổng biết nữa, để tui hỏi lại sếp rồi báo bạn sau.**
  - nllb-600m: I'll ask the boss and let you know later.
  - hymt1.5-1.8b: I really don’t know anymore. I’ll ask my boss again, and then I’ll let you know later.
  - hymt2-1.8b: I really don’t know either. I’ll ask my boss again and then inform you later.
  - madlad-3b: I don't know, so I'll ask my boss and let you know later.
- **Cảm ơn bạn nhiều nha, hẹn gặp lại lần sau!**
  - nllb-600m: Thank you so much, see you next time!
  - hymt1.5-1.8b: Thank you very much! See you next time!
  - hymt2-1.8b: Thank you very much! See you next time!
  - madlad-3b: Thank you so much, see you next time!
