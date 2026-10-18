# 13 — Business Profile (from public website)

Source: `www.tiruppurembossing.com` (Home, About, Contact, service pages). Researched 2026-10-12.
The CRM itself runs at `www.tiruppuremboss.com` (Perfex login).

## 1. Company

| Item | Detail |
|---|---|
| Name | Tiruppur Embossing |
| Tagline | "Printing Innovation at Its Finest" · "One Point Solution for your Printing Needs" |
| Location | Ammapalayam, Tiruppur, Tamil Nadu (no street address/PIN on the site) |
| Phones | +91 98403 37054 (also WhatsApp), +91 80150 25002, +91 97892 68002 |
| Email | tiruppurembossing@gmail.com |
| Social | Facebook `/Tiruppurembossing` (the Instagram link is a placeholder) |
| Positioning | Garment decoration: printing + heat-transfer + embossing. Some transfer stickers are described as exclusive ("no one else can make them"). Phthalate-free / eco-conscious options. |

**Key people (website):** Vignesh (Marketing), Meghala (Finance), Navaneethan (Production). They are the persona champions for Sales, Accounts and Production in [11-ROADMAP.md](11-ROADMAP.md).

## 2. Service / process catalogue (22 offerings)

| Family | Processes | Notes for the CRM |
|---|---|---|
| **Sublimation** | Sublimation printing | Polyester / polymer-coated items (also mugs, phone cases) |
| **HD printing** | HD printing | Fine detail, gradients |
| **Transfers (screen)** | Single-colour transfer, multi-colour transfer | Priced by number of colours, needs screens |
| **Silicon HD** | Glossy, Matte ("Matee"), Puff | Raised and flexible. Silicone consumption. |
| **DTF** | DTF printing | PET film, CMYK + white, cotton/poly/blends, good for small batches and photo-quality designs |
| **Embossing** | Embossing only, embossing with print | Needs dies/plates and the embossing press |
| **PU / heat transfer** | PU transfer printing | Called "Heat Transfer Printing" in some menus. Pick one name for the catalogue. |
| **Speciality finishes** | Flock, Metallic, Rainbow, Glow-in-dark, Reflective, Glitter | Special films/foils. Stock tracking matters. |
| **Sequin** | "Sequence" printing (sequins) | |
| **3D TPU** | 3D TPU transfer | Moulded, rubber-like raised badges, needs moulds |
| **Laser** | Laser cutting / engraving | Fabric, leather, synthetics |

**End uses served:** premium apparel, sportswear, fashion, footwear, outdoor gear, dancewear, festive wear, accessories, packaging, branding.

## 3. Machines (About page)

Rotary printing · laser cutting · milling · glass-table (screen) printing · plotter (vinyl/film cutting) · embossing press. A DTF printer and heat presses are implied by the services.

## 4. What this changes in the plan

The first draft assumed **embossing job work only**. The website shows a **multi-process transfer and print manufacturer**. Two business models are probably mixed:

1. **Make-and-sell transfers/labels.** The company buys films, inks, silicone, foils and TPU, produces transfers to the customer's artwork, and ships them for the customer to heat-apply. This is a sale of goods: raw-material inventory and costing apply.
2. **Job work on the customer's garments.** The customer sends cut panels or garments, the company prints/embosses/applies them and returns them with a DC. This is the job-work flow already in the plan.

**Impact (already applied to the docs):**
- **Process catalogue + configurable spec attributes per process** (colours, size, film type, finish, fabric, placement), driving the rate card and the job card ([03](03-MODULES-AND-FEATURES.md), [08](08-DATA-MODEL.md)).
- **Tooling register widened:** screens, embossing dies, TPU moulds, laser files and plotter files, not just dies.
- **Raw-material inventory + bill of materials (BOM) per product** is now a Must (films, inks, silicone, foils, TPU, adhesive, sequins).
- **Strike-off / sample approval** is a Must. It is standard before bulk production for transfers.
- **Website contact form → CRM lead.** The website form already asks for the service type, so leads arrive pre-tagged.
- **AI artwork agent becomes high-value:** it detects colour count, size and fine detail, suggests the best process (e.g. DTF vs. screen transfer vs. silicon HD), and feeds the quote.

## 5. Still unknown (moved to [12-OPEN-QUESTIONS.md](12-OPEN-QUESTIONS.md))

Founding year, team size, capacity per machine, minimum order quantities, pricing model per process, share of make-and-sell vs. job work, main customers and export share, certifications (e.g. OEKO-TEX), and the street address/GSTIN.
