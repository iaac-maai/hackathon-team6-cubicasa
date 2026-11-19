---
license: cc-by-nc-4.0
library_name: onnx
pipeline_tag: image-feature-extraction
tags:
  - autoencoder
  - similarity-search
  - floor-plans
  - architecture
  - built-environment
  - iaac-maai
  - ai-methods-1
---

<img src="https://raw.githubusercontent.com/iaac-maai/hackathon-team6-cubicasa/main/03_app/public/logo.png" width="72" alt="The logo of the app: a small flat with a bedroom, a kitchen and a living room">

# Floor-plan autoencoder for similarity search (Team 6)

A convolutional autoencoder that squeezes a floor-plan image (128 x 128 px) into a code of 128 numbers, so that plans with a similar layout get codes close to each other. We use it for precedent search: an architect uploads a plan and gets the five most similar plans out of 5,000 real homes. It was made in the AI Methods I hackathon (IAAC MaAI 2026/27).

- **Try it in the app, Plan precedents:** https://hackathon-team6-cubicasa-app.hackathon-team6-cubicasa-app.workers.dev (the team password comes with the course hand-in, then your own account, by email or with Google)
- **Model server:** https://hackathon-team6-cubicasa.onrender.com
- **GitHub repository:** https://github.com/iaac-maai/hackathon-team6-cubicasa
- **Team:** Chloe Hraibeh, Jeff El Khoury, Luca Obejdeanu

![Similarity search](figures/04_similarity_search.png)

Four test plans (left) and their five closest plans out of the 5,000. The matches have the same footprint and proportions: the narrow plan finds narrow plans, the plan made of three buildings finds plans with two or three volumes. The mistakes are in the figure too: three matches of the first query are pale scans, and the first match of the second query is a small square plan full of text.

## Version 3: compare the rooms (used by the server)

Version 3 comes from Chloe's notebook [`internal_layout_v3.ipynb`](https://github.com/iaac-maai/hackathon-team6-cubicasa/blob/main/01_autoencoder/notebook/internal_layout_v3.ipynb). It reads the annotations of CubiCasa5K (`model.svg`) and draws every plan as a room map with 10 room types. The model keeps the encoder of setup C, reading the cleaned drawing, but its decoder has to draw the room map and the walls instead of the lines. So the code holds the layout, and it still works on an uploaded drawing, which has no annotations.

![Rooms predicted by v3](figures/14_v3_predicted_rooms.png)

For the 373 test plans with annotations we judged the 5 nearest training plans with the annotations:

| | v2 | v3 | structural search on the annotations | random |
|---|---|---|---|---|
| Same number of bedrooms | 28% | **34%** | 78% | 21% |
| Same number of bathrooms | 36% | **39%** | 81% | 29% |
| Rooms off by | 4.7 | **3.7** | 1.4 | 5.7 |

v3 beats v2 on every measure, by a little. The predicted plan area overlaps the true one by 68%, and the living room and bedrooms are found much better than bathrooms and kitchens, whose fixtures and names mostly disappear at 128 px.

![An atlas of layouts](figures/17_layout_atlas_v3.png)

Version 3 files: `floorplan_ae_v3.onnx` with two outputs, `code` (N x 128) and `rooms` (N x 12 x 128 x 128: channels 0 to 10 are the room classes, channel 11 the walls); `floorplan_ae_v3.pt`; `floorplan_ae_v3_config.json` with the room classes and colours; `collection_codes_v3.npy`; `atlas_v3_xy.npy`; and `collection_rooms_128.npz`, the true room maps of the 5,000 plans. The input is the cleaned drawing, see `clean_plan` in the server's [`app.py`](https://github.com/iaac-maai/hackathon-team6-cubicasa/blob/main/02_model_server/app.py).

## Version 2: compare the layout, not the drawing style

Version 1 grouped plans by how they're drawn (bold, faint, grey fills) as much as by their layout: a faint scan mostly found faint scans. In version 2 every plan is first cleaned down to its lines: a 5 x 5 px opening finds the wide parts (grey fills, grey paper, dark borders), the plan minus these parts leaves the lines, and each plan's lines are scaled by its own strong lines and cut into black and white. Then setup C is trained again on the cleaned plans, with the same settings.

| | v1 (as drawn) | v2 (cleaned) |
|---|---|---|
| Retrieval top-1 (test) | 69% | **86%** |
| Faintest quarter of the plans | 28% | **77%** |
| Boldest quarter of the plans | 98% | 81% |

![How much of the drawing style is in the codes](figures/10_style_in_codes.png)

To measure the style we used the rendering features from Chloe's notebook (how much is drawn, contrast, edge strength, sharpness) plus the grey fills. For each one we compare a plan with its 5 nearest plans and with 5 random plans: 100% means the search ignores it. With v2 every style feature moves towards 100%, while the proportions stay low, so the neighbours still have the same shape. The boldest plans lose, because walls thicker than about 5 px partly disappear in the cleaning.

![The atlas with v2](figures/12_plan_atlas_v2.png)

On the v2 atlas bold, grey and faint drawings are mixed, and the map is ordered by shape: tall, narrow plans at the top, wide ones at the bottom, small drawings on the right.

Version 2 files: `floorplan_ae_v2.onnx` (same two outputs as v1), `floorplan_ae_v2.pt`, `floorplan_ae_v2_config.json`, `collection_codes_v2.npy` and `atlas_v2_xy.npy` (each plan's place on the atlas, 0-1). To use v2, clean the plan after the preprocessing below with `clean_plan` from the server's [`app.py`](https://github.com/iaac-maai/hackathon-team6-cubicasa/blob/main/02_model_server/app.py).

## What's in this repository

| File | What it is |
|---|---|
| `floorplan_ae.onnx` | the model, 4.5 MB. Two outputs: `code` (N x 128, used for the search) and `reconstruction` (N x 1 x 128 x 128, the plan rebuilt from the code) |
| `floorplan_ae.pt` | the same weights for PyTorch |
| `floorplan_ae_config.json` | the image size, the preprocessing steps and the code size |
| `collection_codes.npy` | the codes of all 5,000 CubiCasa5K plans |
| `collection_ids.json` | the plan each code belongs to |
| `collection_plans_128.npz` | the 5,000 plans themselves after preprocessing (128 x 128, walls bright), with their ids and split, in the same order as the codes. The model server uses them to show the matches |
| `floorplan_ae_v2.onnx`, `floorplan_ae_v2.pt`, `floorplan_ae_v2_config.json`, `collection_codes_v2.npy`, `atlas_v2_xy.npy` | version 2, trained on cleaned plans |
| `floorplan_ae_v3.onnx`, `floorplan_ae_v3.pt`, `floorplan_ae_v3_config.json`, `collection_codes_v3.npy`, `atlas_v3_xy.npy`, `collection_rooms_128.npz` | version 3, drawing to rooms. The model server uses it |
| `examples/` | four test plans to try |

## Dataset

| | |
|---|---|
| Name | [CubiCasa5K](https://zenodo.org/records/2613548) |
| Size | 5,000 floor-plan images, mostly of Finnish homes; official split 4,200 / 400 / 400 |
| Dataset licence | CC BY-NC 4.0. [CubiCasa5K licence](https://github.com/CubiCasa/CubiCasa5k/blob/master/LICENSE) |
| Cite | Kalervo, A. et al. (2019), CubiCasa5K: A Dataset and an Improved Multi-Task Model for Floorplan Image Analysis, SCIA |

## Architecture and preprocessing

- **Encoder:** 4 convolutions with stride 2 (1, 16, 32, 64 and 64 channels; 128, 64, 32, 16 and 8 px) with ReLU, then a linear layer down to the 128 numbers of the code.
- **Decoder:** the same in reverse, with transposed convolutions and a sigmoid at the end.
- **Parameters:** 1,173,185.
- **Preprocessing**, which must be exactly the same when you use it: greyscale, invert (walls bright, background dark), pad to a square with black, resize to 128 x 128 (Lanczos), pixels between 0 and 1. Input shape N x 1 x 128 x 128, `float32`.

## Training and the setups we compared

Official split, seed 42, 20 epochs, batches of 64, Adam with learning rate 0.001, on a laptop CPU. We trained with binary cross-entropy, because with MSE the models got stuck drawing a blank page (only 6.5% of the pixels are lines), and we score with MSE. For scale: a blank page gets a test MSE of 0.0300 and the average training plan 0.0243.

| Setup | Parameters | Test MSE | Retrieval top-1 (test) |
|---|---|---|---|
| A: dense, code 64 | 8,438,336 | 0.0162 | 21% |
| B: conv, code 32 | 386,657 | 0.0153 | 47% |
| **C: conv, code 128 (this model)** | 1,173,185 | **0.0131** | **69%** |

Retrieval top-1: every test plan is shifted by 3 pixels and gets a bit of noise, and we count how often its closest code among the 400 test plans is the original.

![Baselines](figures/05_baselines.png)

The same test with two simpler ways of comparing plans. The raw pixels find the original only 4% of the time, because a shift of 3 pixels moves every line onto other pixels, and PCA with 128 numbers 25%. With the same 128 numbers the autoencoder gets 69%, so the neural network is worth it here.

![Training curves](figures/02_training_curves.png)

The training loss (BCE) and the validation error (MSE) of the three setups. All of them were still improving at epoch 20, and C ends with the lowest validation error.

![Reconstructions](figures/03_reconstructions.png)

Input plans and how A, B and C rebuild them. A gives a grid-like blur, B keeps only the outline, and C keeps the outline and the main inner walls. None of them keeps doors, furniture or text.

## What the codes learned

![An atlas of the 5,000 plans](figures/08_plan_atlas.png)

All 5,000 plans placed on a map by their codes (UMAP), drawn as themselves: every cell of the grid shows the plan closest to its centre. Narrow plans are on the left and wide ones on the right, bold drawings at the top and small, very wide plans at the bottom. The model found this order by itself, only by learning to redraw the plans. It groups plans by shape and by how they're drawn, not by how the rooms are used.

## Limitations of version 1: where it fails

![Where the search fails](figures/06_failures_by_ink.png)

The test plans in four quarters by how much is drawn on them. On the boldest quarter 98% of the shifted copies find their original, on the faintest only 28%: a faint scan gives the encoder little to hold on to.

- At 128 px thin walls, doors and text blur, so it compares the overall shape and how much is drawn, not the room programme.
- The way a plan is drawn influences the matches: faint scans are found much less often, and they often find other faint scans.
- Retrieval is 69%: in about 3 out of 10 cases a slightly shifted copy doesn't find its own original first.
- It isn't rotation-invariant, and it was trained on mostly Finnish homes.
- The training dataset is CC BY-NC 4.0. [CubiCasa5K licence](https://github.com/CubiCasa/CubiCasa5k/blob/master/LICENSE).

## How to use

```python
import json
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps
from huggingface_hub import hf_hub_download

repo = "iaac-maai/hackathon-team6-cubicasa-ae"
session = ort.InferenceSession(hf_hub_download(repo, "floorplan_ae.onnx"))
collection = np.load(hf_hub_download(repo, "collection_codes.npy"))
ids = json.load(open(hf_hub_download(repo, "collection_ids.json")))


def preprocess(path, size=128):
    #the same steps as in training: greyscale, invert, pad to a square, 128 px, 0-1
    plan = ImageOps.invert(ImageOps.grayscale(Image.open(path)))
    side = max(plan.size)
    square = Image.new("L", (side, side), 0)
    square.paste(plan, ((side - plan.width) // 2, (side - plan.height) // 2))
    small = square.resize((size, size), Image.Resampling.LANCZOS)
    return (np.asarray(small, dtype=np.float32) / 255)[None, None]   # shape (1, 1, 128, 128)


plan_path = hf_hub_download(repo, "examples/plan_high_quality_architectural_1191.png")
code, reconstruction = session.run(None, {"image": preprocess(plan_path)})
distances = np.linalg.norm(collection - code, axis=1)
for i in np.argsort(distances)[:5]:
    print(ids[i], round(float(distances[i]), 1))
```

The first result is the plan itself, because it's in the collection too. This snippet uses version 1; for versions 2 and 3 see above.

## Links

- Code and notebook: https://github.com/iaac-maai/hackathon-team6-cubicasa
- Authors: Chloe Hraibeh, Jeff El Khoury, Luca Obejdeanu, AI Methods I, IAAC MaAI 2026/27

Chloe's version 4, trained on drawings aligned with their annotations, is not on the Hub: it writes a separate local bundle. See the [aligned model workflow](https://github.com/iaac-maai/hackathon-team6-cubicasa/blob/main/01_autoencoder/README.md#aligned-layout-model-v4) for its inputs, model selection and verification.
