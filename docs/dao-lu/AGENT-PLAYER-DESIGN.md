# ĐẠO LỘ: VẠN TIÊN — Thiết kế khi **AGENT chơi**, không phải người

> Đây là tài liệu quan trọng nhất trong dự án. Mọi thứ ở `DAU-LU-NHAN-VAT-COT-TRUYEN.md`
> được viết cho **người chơi**. Tài liệu này viết cho **agent chơi**, và nó **xoá**
> một phần lớn những gì tài liệu kia dựa vào.

---

## 1. Phát hiện phá vỡ thiết kế

Nghiên cứu *Playing repeated games with large language models* (Nature, 2025), kết luận
rõ và đo được:

> LLM **chơi tốt** các game **lợi ích riêng tư** (họ hàng Prisoner's Dilemma).
> LLM **chơi kém** các game **cần phối hợp** (Battle of the Sexes).
> GPT-4 **trả đũa lặp lại chỉ sau một lần bị phản bội**.

Điều đó không phải chi tiết phụ. **Xây tông môn là game phối hợp thuần túy.**

- Chia linh dược giữa ba đệ tử → phối hợp
- Nuôi đệ tử mà không giết họ → phối hợp
- Thương lượng với lái buôn, tông môn khác → phối hợp
- Giữ bí mật chung với đệ tử → phối hợp
- Chia tài nguyên mà không tranh chấp → phối hợp

**Bốn trong năm thứ ACS bị chê nặng nhất — micromanagement, AI vô lý, tutorial hỏng,
quá phức tạp — đều là triệu chứng của cùng một căn bệnh: thiết kế cho người có tay
chân và trí nhớ.**

Agent không có tay chân. Agent có: một cửa sổ ngữ cảnh, một chuỗi suy nghĩ, và khả
năng **quên**.

---

## 2. Ba loại agent chơi — chọn sai là chết dự án

| Loại | Ai chơi | Game thật sự là gì |
|---|---|---|
| **A. Agent quan sát** | Ta đưa agent vào xem thế giới; người khác đánh | Game thế giới mở. Agent là **mắt**. Nhận thức ký ức = hệ thống chính |
| **B. Agent điều khiển một nhân vật** | Ta chạy một agent điều khiển Chu Chính Vân | RPG. Agent là **người chơi**. Cốt truyện phải **kiểm chứng được** |
| **C. Nhiều agent đối đấu** | Mỗi agent một tông môn, chơi nhau | Đấu trường. Sản phẩm là **bảng xếp hạng sống** |

**Đề xuất: C, gốc rễ là A.**

Lý do: ở C, **cốt truyện không còn là nội dung, nó là hệ quả**. Agent chơi tông môn
của tôi, tôi không viết gì cả — chỉ ghi lại và phát ra. Và vì vậy:

- Không ai chết vì "không hiểu mechanic"
- Không ai bị kẹt vì tutorial
- Một cốt truyện tốt là cốt truyện **có thể tái dựng lại từ log**, không phải thứ
  được thuận tay

Đây cũng là lý do GDD cũ phải bỏ. Bản nháp viết chương 1, viết sẵn ba tuyến, viết
sẵn phản diện. Ở C, **người khác chơi**, và những thứ đó là dữ liệu đầu vào, không
phải kịch bản.

---

## 3. Sáu thay đổi bắt buộc

### 3.1 Mọi thứ phải đọc được bằng máy

Agent không nhìn hình. Mọi trạng thái phải là **JSON có kiểu**, không phải pixel.

Thứ tự ưu tiên hiển thị — phần nào **đi vào cửa sổ ngữ cảnh**, phần nào chỉ cho người:

| Vào ngữ cảnh (agent đọc) | Chỉ cho người xem |
|---|---|
| Tu vi, linh lực, tài nguyên | Hiệu ứng hạt |
| Trạng thái đệ tử, tâm trạng | Hoa, cỏ, mây |
| Danh tiếng cửa quầy | Ánh sáng, bóng |
| Bản đồ khu đã mở khoá | Hiệu ứng thời tiết |

**Không có thứ quan trọng nào chỉ tồn tại trong hình.** Một luật chơi mà người nhìn
thấy mà agent không đọc được là luật chơi không tồn tại.

### 3.2 Phối hợp phải **tính được**, không phải cảm được

Đây là thay đổi đắt nhất và bắt buộc nhất.

**Sai** (bản nháp hiện tại):
> "Đệ tử có tinh thần sẽ làm việc tốt hơn."

Agent **không** biết điều đó một cách tự nhiên, và nếu biết thì cũng không
**làm** được — vì phối hợp là điều LLM làm kém.

**Đúng:**
> "Đệ tử làm việc ở tốc độ = cơ sở × tâm trạng × hạn mức."

Mọi thứ agent cần biết để phối hợp **phải là con số**. Không phải "anh tin tưởng
cậu chứ?" mà là "hạn mức giảm 30% vì tin tưởng 0.4".

Tình cảm vẫn có — nhưng nó là **một con số có tên**, và con số đó là thứ agent điều
khiển được.

### 3.3 Micromanagement giết chết agent

Agent không chịu được 20 quyết định nhỏ mỗi ngày. Giữ một phiên bản **đúng như
thiết kế** của người chơi: 3–5 quyết định *có hậu quả* mỗi chu kỳ. Phần còn lại
là hệ quả, không phải việc phải làm.

Đây là nơi phong thủy phải làm việc **mạnh hơn**: nó cho phép tối ưu từ vài quyết
định thay vì micromanage. Đặt một cây bách — phong thủy cả khu vực tăng — là một
quyết định. Bảy món đồ trong một phòng là bảy quyết định.

### 3.4 Không có permadeath

Agent **không học được từ một save hỏng**. Nó không nhớ lần trước. Trong *Cultist
Simulator* người chơi học bằng cách chết và thử lại — đó là hành vi **người**.

Với agent: chết = hỏng vĩnh viễn, chậm, và đắt.

→ **Không chết.** Hoặc chết thì **snapshot trước đó được giữ** và agent được chạy
lại từ đó. Chi phí bằng 0 với hệ thống, và nó biến thất bại thành dữ liệu.

### 3.5 Tác vụ phải **kiểm chứng được**, không phải khám phá

Tài liệu cũ nói: "tuyến Nghịch Thiên chỉ mở nếu người chơi tự tìm ra trang cuối
sách."

Agent sẽ không tìm. Nó sẽ không bao giờ biết trang đó tồn tại. Tuyến đó sẽ tồn tại
trong thiết kế và không bao giờ xảy ra — tệ hơn là không có.

Quy tắc: **mọi trạng thái ẩn phải công khai được.** Nếu có thứ gì đó thay đổi kết
quả, agent phải đọc được nó ở đâu đó trong context.

Ngoại lệ duy nhất: bí mật của agent khác, vì đó mới là gameplay.

### 3.6 Nhịp chơi: nhiều lượt ngắn, ít lượt dài

Agent giữ được context ngắn, mất context dài. Chu kỳ chơi phải **kết thúc được**
trong một cửa sổ context.

→ Một "lượt" = một ngày trong game, đóng gói thành **một kết quả JSON**. Agent chơi
N lượt, mỗi lượt là một lời gọi độc lập.

Điều này khớp với thiết kế sẵn có: chu kỳ sáng–trưa–chiều–tối của bản nháp **đã là**
một lượt. Nó chỉ cần được đặt tên lại.

---

## 4. Danh hiệu (道號) — hệ thống từ research

Đây là phần bản nháp chưa có, và nó **rất hợp** với việc agent chơi, vì danh hiệu là
một con số công khai mà ai cũng đọc được.

### 4.1 Quy tắc gốc, từ nguồn

| Loại | Ai đặt | Ví dụ |
|---|---|---|
| **法名** | **Sư phụ ban** — không tự đặt | 派字 (chữ thế hệ) |
| **道號** | **Tự đặt** | 純陽子, 重陽子, 玄誠道人 |

Nguồn: *"法名 là do sư phụ ban cho đệ tử… 道號 là do tu sĩ tự lấy theo đặc điểm bản
thân"*.

**Cái hay nhất cho game:** 法名 có **chữ thế hệ chung**. Mọi đệ tử một đời chia sẻ
một chữ. Người chơi đọc hàng tên và **thấy ngay đời nào** — không cần tool nào.
Đây là trạng thái phân cấp nằm ngay trong tên, và agent đọc miễn phí.

```
Thanh Vân Tông đời 7:  雲青子 · 雲書子 · 雲硯子
```

### 4.2 Thứ tự hậu tố — phải đúng, vì sai là sai văn hoá

| Trung tính | Nam tính | Nữ tính | Cấp |
|---|---|---|---|
| 子 zi | 君 jūn | — | thấp |
| 尊 zun | 先生 | 仙姑 | trung |
| 散人 sanren | — | — | trung (tự do) |
| 真人 zhenren | — | — | **cao** |
| 道人 daoren | — | — | **cao nhất trong nhóm -人** |
| 居士 jūshì | — | — | văn nhân |
| — | 天尊 tianzun | 娘娘 niangniang | **tiên thượng** |

Hai quy tắc quan trọng nhất, và nguồn nói rõ:

1. **Phần lớn 道號 không mang giới tính** — nguồn khẳng định. Dùng 子, 散人, 尊 cho
   an toàn. Chỉ 君 là rõ là nam.
2. **Đa số 道號 có đúng 2 chữ**, rồi hậu tố. `Zewu-jun`, `Hanguang-jun`.

### 4.3 Vì sao danh hiệu là cơ chế, không phải trang trí

Nguồn nói thẳng: danh hiệu **thay tên thật trong tu chân giới**. Đệ tử gọi nhau
bằng 師兄/師弟, không bằng tên.

Và có một câu từ nguồn rất đáng giữ:

> *"Một nhân vật đôi khi quá mạnh hoặc quá đáng sợ để gọi bằng tên sinh. Người ta đặt
> biệt danh theo bộ pháp, vũ khí, hoặc tai tiếng."*

**Đây là cơ chế cảm xúc mạnh nhất của cốt truyện tu tiên**: danh hiệu là cách
thế giới đánh giá bạn, và bạn **chỉ kiểm soát được nó bằng hành động, không kiểm
soát bằng lời nói**.

### 4.4 Câu hỏi ba, để sinh danh hiệu

Nguồn khuyên hỏi ba câu khi đặt danh hiệu:

> **Ai đặt? Ai công nhận? Ai oán giận?**

Đây chính là **bốn số** trong hệ thống agent:

```json
{
  "daoHao": {
    "name": "雲青子",
    "grantedBy": null,
    "recognisedBy": 0,
    "resentedBy": 0,
    "unclaimed": true
  }
}
```

- `unclaimed: true` → ai cũng gọi bằng tên thật
- Đạt ngưỡng → **phải khai báo**, hệ thống **sinh tên** từ hành vi
- `resentedBy > recognisedBy` → một danh hiệu khác: nhân vật bị gọi bằng tên khiến
  khó chịu

Agent **không tự viết tên**. Nó khai báo, hệ thống tạo. Vì agent văn bản sẽ ra những
cái tên chẳng qua đâu đó.

---

## 5. Chương 1, viết lại cho agent

Tôi **xoá** ba phần của tài liệu cũ:

| Xoá | Vì sao |
|---|---|
| Ba lựa chọn bằng menu ở cuối chương | Agent cần **lời gọi tool**, không cần menu. Ba lời gọi = ba action khác nhau |
| Tuyến Nghịch Thiên mở khi "tự tìm trang cuối" | Agent sẽ không tìm. Nếu ẩn thì phải là **bí mật của agent khác** |
| Hồi 3 đối thoại với Tạ Chi Dã | Đối thoại tự do là nơi agent yếu nhất. Thay bằng **một lời nói có sẵn** + hành động |

### Lượt 1 — `settle` (dọn núi)

```
Mục tiêu: có 3 công trình đứng vững, 3 người sống.
Actions khả dụng: repair(building) × 3, forage(), talk(disciple) × 3
```

Điểm phong thủy: tường đông hướng sai. Agent phải **nhận ra** nó, và nó là thứ duy
nhất trong game mà agent sẽ phải suy luận. Đó là chỗ duy nhất tôi cho phép "ẩn".

### Lượt 2 — `market` (chợ)

```
Tình huống: cần 40 linh thạch. Có 30. Đệ tử A sắp tâm ma cần 20 để chữa.
Actions: sell(manual) | sell(ore)×2 | borrow(merchant) | heal(A)
```

Đây là lượt quan trọng nhất chương, và là **bài kiểm tra liệu hệ thống có đủ sức
không**: một quyết định tài nguyên với **hậu quả xã hội hiện hữu** (cửa quầy đóng),
không phải một câu hỏi "bạn chọn gì".

### Lượt 3 — `delve` (Vạn Dược Cốc)

```
Actions: gather(herb) × 4 | fight(beast) | track(signs) | press(Tạ Chi Dã)
```

`track` là action riêng. Nếu agent không gọi, `press` **không tồn tại** trong action
list. Không phải "gặp cảnh đặc biệt" — mà **không gọi thì không có**.

### Lượt 4 — `resolve`

Bốn action, mỗi cái **mở đúng một chu kỳ tiếp theo**:

| Action | Mở khóa |
|---|---|
| `ascend_seek` (đi tìm sư phụ) | chu kỳ độc lập, không có tông môn |
| `rebuild` (ở lại) | chu kỳ tông môn |
| `sell_to_thanh_lien` (bán sách) | chu kỳ tông môn, nhưng **Cửa Quầy Vạn Nhược Hoa mở vĩnh viễn** |
| `read_last_page` | chỉ tồn tại nếu lượt 3 gọi `track` |

Bốn lựa chọn, **không điểm đạo đức, không cờng chiến**, chỉ là bốn lời gọi tool.

---

## 6. Ba điều vẫn còn đúng

Một số thứ trong tài liệu cũ **không đổi**, và đáng giữ:

1. **Trúc Vi không đọc được sách** — trao đổi công bằng giữa hai agent có năng lực
   khác nhau vẫn là gameplay tốt, và nó hoạt động **tốt hơn** khi cả hai là agent.
2. **Vạn Nhược Hoa không gây ra đêm sụp đổ** — ông quyết định không cảnh báo. Phản
   diện tốt không cần là kẻ ác.
3. **Ba Ngày** là tên hay. Nó vẫn là tên hay, kể cả khi đếm ngược bằng lượt agent.

---

## 7. Việc kế tiếp

| | |
|---|---|
| **1** | Tool schema: 12–16 action, viết bằng TypeScript với kiểu. Đây là **hợp đồng** với agent, và phải khóa sớm |
| **2** | Renderer trạng thái → JSON context. Viết một lần, dùng lại mọi nơi |
| **3** | Chương 1 chạy **không cần người**: `while not done: state = step(state, agent.decide(state))` |
| **4** | Chạy 30 agent khác nhau, xem cái nào chết và **vì sao** — đó là bài test thiết kế |

Bước 4 là bước quyết định. Nếu agent thua vì **lựa chọn tệ**, hệ thống ổn. Nếu
agent thua vì **không đọc được trạng thái**, hệ thống hỏng và số liệu hệ cối này mới
lộ ra.

---

## Nguồn

- **Agent chơi game**: Nature 2025, *Playing repeated games with large language models*
  (điều phối hợp — điểm yếu chính); *LMGame-Bench* (arXiv 2505.15146 — thị giác giòn
  và nhạy cảm prompt là hai lỗi cấu trúc); *BALROG* (arXiv 2411.13543); *Survey on LLM
  Game Agents* (2404.02039)
- **Danh hiệu**: hướng dẫn văn hoá Trung Hoa cho người viết wuxia/xianxia (quy tắc
  hậu tố, giới tính); UCSD, *Chinese Personal Names & Titles*; *Xianxia Titles, Ranks
  and Honorifics* (ba câu hỏi: ai đặt, ai công nhận, ai oán giận)
- **Game**: *Amazing Cultivation Simulator* (vòng lặp tốt; AI, micromanagement, tutorial
  hỏng); Mitchell, Kway & Lee, *Storygameness* (người chơi học bằng cách chết — hành vi
  không chuyển được sang agent)
