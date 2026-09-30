# Research — Đạo Lộ: Vạn Tiên

> # ⚠️ TERMINOLOGY — CRITICAL, ĐỌC TRƯỚC MỌI THỨ KHÁC
>
> **`沙雕动画` KHÔNG có nghĩa là sand animation.**
>
> Trong dự án này, `沙雕动画 / 沙雕修仙动画` chỉ một thứ: **thể loại/phong cách animation
> Internet Trung Quốc — hài, absurd, ngớ ngẩn, cố tình ngớ ngẩn — với nội dung tu tiên.**
>
> `沙画` và `沙动画` là **hai khái niệm khác**, chỉ về hội họa trên cát và hoạt hình cát. **Không
> phải hướng sản phẩm.**
>
> **Đừng suy ra** cát thật · bàn đèn · vẽ trên cát · stop-motion bằng cát, từ từ `沙雕动画`.
>
> Ba từ dùng chung âm **沙** và không liên quan gì về kỹ thuật:
>
> | Từ | Nghĩa |
> |---|---|
> | **沙画** | hội họa trên cát — nghệ thuật biểu diễn, có nghệ sĩ và tác phẩm thật |
> | **沙动画** | hoạt hình **定格** dùng cát |
> | **沙雕动画** | slang từ 傻屌: **hài, absurd** — và ngập trong nội dung tu tiên |
>
> Nguồn và cây từ: `TERMINOLOGY-沙雕.md`

---

## Trạng thái mỗi mục

Đọc cột trạng thái **trước khi dùng mục đó**:

| | |
|---|---|
| ✅ **ĐÃ NGHIÊN CỨU** | có nghiên cứu thật, có nguồn, **đã qua skeptic** |
| 🟡 **NGHIÊN CỨU SỘ** | có một nhánh, chưa đủ để dựng lên |
| ⬜ **CHƯA NGHIÊN CỨU** | **không có gì.** Chỉ có câu hỏi. **Đừng trích như sự thật** |

---

## 1. Scope

Nghiên cứu phục vụ một game tu tiên **có agent LLM làm người chơi**, người xem là con người đến
muộn. Ba giới hạn chi phối mọi cơ chế:

1. **Không scalar sức mạnh.** Luật đã ship trong repo: một khi con số xếp hạng tồn tại, mọi hệ
   khác trở thành hàm của nó. Xem `packages/features/progression/src/rules.ts`.
2. **Đơn vị duy nhất là lượt.** Không có giây trong kinh tế.
3. **Không cơ chế nào đòi thương lượng tự do giữa các agent.** LLM chơi tốt game lợi ích riêng
   tư, chơi kém game cần phối hợp.

---

## 2. 沙雕动画 — ⬜ CHƯA NGHIÊN CỨU

Chỉ có định nghĩa (mục terminology gate) và mô tả định dạng đã nêu. **Chưa quét hệ sinh thái.**

> **Cần trả lời:** thể loại này thực sự được cấu thành thế nào — pipeline render, hậu kỳ dùng
> gì, bao nhiêu giờ một tập, dùng AI hay không. **Không assume đó là một kỹ thuật render.**

---

## 3. 沙雕修仙动画 — ⬜ CHƯA NGHIÊN CỨU

> **Đường đi đúng:** từ hai danh sách Bilibili đã biết —
> 「盘点**五十八部**高创好看的修仙题材沙雕动画及作者」
> 「我一年刷了 4000 小时沙雕动画，盘点**60 部**修仙沙雕必看榜」
> → 50–100 series/creator → truy ngược từng cái về `原著` → bảng:
>
> ```
> series → 原著 → tác giả → nền tảng → định dạng animation
>        → độ dài tập → cấu trúc scene
> ```
>
> Điểm vào đầu tiên: **`灵血修仙`** (原创, **十缺废人**) — có series riêng, có mô tả nhân vật,
> tông môn, chiến lực, setting. Tức **metadata cấu trúc**, không chỉ lore.

Cây breakdown cần lấp:

```
Story    ├ narration ├ dialogue ├ joke/absurdity └ cultivation progression
Scene    ├ background ├ characters ├ props ├ pose ├ expression ├ camera ├ transition └ VFX
Character├ reusable base ├ pose library ├ expression library ├ mouth states └ transformation
Audio    ├ narrator ├ character voices ├ SFX ├ music
Visual   ├ reveal ├ erase ├ replace ├ morph ├ sudden transformation
```

---

## 4. 修仙小说 — ✅ ĐÃ NGHIÊN CỨU, sâu

**19 domain · 40 agent · 6M subagent token.** Toàn bộ ở **`GENRE-CANON.md`**.

Vực được thừa hưởng miễn phí — 12 cụm từ vựng, vì người đọc tu tiên đã biết:

| Cụm | Ví dụ | Ta được gì |
|---|---|---|
| Thang và bức tường | 境界 · 炼气 · 筑基 · 结丹 · 元婴 · 化神 · 瓶颈 · 天劫 · 顿悟 | hiểu cột sống, trần, và bức tường |
| Bẩm sinh và phép thử | 灵根 · 测灵石 · 仙缘灯 · 五行相生相克 | tính bất đối xứng và cảnh phép thử |
| Ba thân | 肉身 · 神魂 · 本命 · 泥丸宫 · 识海 · 搜魂 | mô hình quyền lực **không cộng-thuật** duy nhất của thể loại |
| Cuốn sách và kệ | 功法 · 心法 · 玉简 · 残卷 · 藏经阁 | kinh tế tri thức + `顿悟` (cửa sổ, không phải tỉ lệ) |
| Vật thể | 法宝 · 认主 · 本命法宝 · 符宝 | truyền thống **vật thể không thang**; `符宝` đổi quyền lực lấy **thời gian** |
| Nghề và nguyên liệu | 炼丹 · 灵草 · 年份 · 主药辅药 · 丹毒 | hệ thống **duy nhất có cấu trúc ràng buộc liệt kê được** |
| Nơi chốn và mạch | 洞府 · 灵脉 · 坊市 · 秘境/禁地 · 界壁 | tập trung là **một nơi**, và linh khí **không cạn** |
| Cơ quan | 宗门 · 内外门 · 贡献点 · 论道 | thang **thứ hai độc lập**, cổng theo trạng thái chính bạn |
| Tên và uy tín | 道号 · 法名 · 字辈 · 散仙 vs 金仙 | nhận dạng + sức xã hội, **không mang con số quyền lực** |
| Trao đổi | 灵石 · 四品阶 · 储物袋 · 户帖 | phẩm cấp nằm trên **vật**, cảnh giới trên **người** |
| Kẻ thù và bạn đồng hành | 妖兽 · 妖丹 · 血契 vs 魂契 · 反哺 | **hai kinh tế kéo ngược cùng một cơ thể** |
| Đồng hồ | 一甲子 · 闭关 · 寿元 | cảm giác thời gian sâu — **và là cụm nguy hiểm nhất kế thừa** |

**Ba phát hiện đáng giữ nhất, từng đã qua skeptic:**

1. **`筑基` — bậc thứ hai của thể loại — theo nguyên văn `内丹` không phải một bậc, nó là
   hành động mở một mạch.** Độ khó là **thuộc vị trí, không phải số**: cùng linh lực, cùng cảnh
   giới, hỏng ở node khác nhau tùy đường đi tới.
2. **Tử thôn là thuộc tính của một con đường, không phải ngưỡng phải vượt.** `极光世界`, trang
   chính thức: 「丹士并不追求法力上的强大，因此**永远不会有天劫之忧**」.
3. **Xa gia vs tán tu, ba đời sau mới đoán ra:** động cơ của `凡人修仙传` là **tính toán** — khan
   hiếm, bất đối xứng, lý do người ta nói không phải lý thật. Động cơ cảm xúc của
   `斗破苍穹` **không chuyển được sang agent**, vì agent không bị xúc phạm.

Kiểm kê 41 hệ thống có trạng thái, 15 ràng buộc cứng, 20 thiết kế **đừng copy**, và 9 khoảng
mở xếp hạng — tất cả ở `GENRE-CANON.md`.

---

## 5. 漫剧 / 动态漫 — 🟡 NGHIÊN CỨU SỘ

Chỉ có quy mô thị trường, chưa có cấu trúc.

- 2025: thị trường **168 tỷ RMB**, tổng lượt phát **700亿**. Chỉ riêng Douyin native > 60.000 tác phẩm
- **表情包/沙雕漫剧 chiếm 44,44% nguồn cung** — hạng 1. TOP3 tháng 6/2025: **cả 3 đều 沙雕漫**
- Đề tài được ưa: 逆袭 #1, **玄幻仙侠 #2**
- Từ khoá nóng: 重生 · 觉醒 · **修仙** · 天命 · 穿越 · 女帝
- **Nhưng đang chững**: tỉ trọng số lượng từ >60% rơi còn ~30%; lượt phát **63% → 26%**

> **Cần trả lời:** một tập 漫剧 được dựng thế nào, và nó khác một tập 沙雕修仙 animation ở chỗ
> nào. Đây gần như là câu hỏi quyết định liệu hai cái có phải một hay không.

---

## 6. Scene Structure — 🟡 CHỈ CHIẾN ĐẤU

**Chiến đấu**: ✅ đã nghiên cứu sâu (đợt 3). **Scene của 沙雕动画**: ⬜ chưa.

Cấu trúc lượt đã ship, và chỉ hai thoả ràng buộc "đơn vị là lượt":

| Nguồn | Cấu trúc |
|---|---|
| 指尖修仙 (2017) | 回合制, trần 60 lượt, **hòa thì bên phòng thủ thắng**. **Khối 6 lượt**, màn xếp thứ tự ở đầu trận và cuối mỗi khối, tự chọn sau giới hạn chờ |
| 无极仙途 (2024) | 30 lượt, không giết là bên công thua |
| 剑侠情缘95 (2001) | Bậc trật tự là thuộc tính **cả đội**; **5 nhân vật yếu thắng 1 nhân vật mạnh** |
| 弈仙牌 | Không free text, mọi số hạng công bố — nhưng `修为` làm **ba việc**, vi phạm chính luật repo |

**Cần trả lời:** một tập 沙雕 animation chia scene thế nào, và cắt cảnh ở đâu.

---

## 7. Character / Pose / Expression — ⬜ CHƯA NGHIÊN CỨU

Không có gì. Đây là **mảng sạch nhất** và cũng là mảng **quyết định chi phí** — một hệ
pose + expression dùng lại là khác biệt giữa "làm được" và "không làm nổi".

> **Cần trả lời:** thư viện pose và biểu cảm điển hình gồm những gì; một nhân vật có cần
> pose riêng hay dùng lại được; miệng có mấy trạng thái.

---

## 8. Camera / Transition — ⬜ CHắA NGHIÊN CỨU

Không có gì.

> **Cần trả lời:** chuyển cảnh trong format này thuộc loại nào — cắt cứng, morph, hay dựng
> rồi xoá? **Đây là chỗ cơ chế §10 có thể đúng hoặc không.**

---

## 9. Narration / Dialogue / Sound — ⬜ CHƯA NGHIÊN CỨU

Không có gì ngoài một quan sát: format điển hình **có** voice-over kể chuyện, và joke/
exaggeration/absurdity là **một phần của trải nghiệm chứ không phải lớp phủ**.

> **Cần trả lời:** tỉ lệ narration/dialogue; giọng kể chuyện thay đổi thế nào khi có twist;
> SFX gắn với cái gì.

---

## 10. Visual Storytelling Mechanisms — 🟡 MỘT PHẦN

**Đã xác minh, một cơ chế:**

> **dựng lên → xoá → thay bằng trạng thái kế.** Và không ai — **kể cả agent** — biết trạng
> thái trước đã tồn tại.

Nguồn duy nhất ta có là 沙画, và nó **đúng bất kể phương tiện**:

> 「将画好的画盖掉，是为了**后面更好地呈现**。这在别人看来可能是悲凉的，但在我看来**这才是沙画
> 生命力所在**。」
> 「沙动画精妙之处在于**擦除沙子时的衔接设计**。」 — kỹ thuật lõi **không phải lúc vẽ, mà là
> lúc xoá**.

**Sửa một chỗ tôi đã gộp nhầm:** `扮猪吃虎` và cơ chế này **không phải một**.

| | Là gì |
|---|---|
| `扮猪吃虎` | **một trope kể chuyện** — giả yếu để che thực lực |
| dựng → xoá → thay trạng thái | **một cơ chế chuyển hình thị giác** |

Chúng kết hợp được. Ở game này, `扮猪吃虎` **được agent chơi bằng `Scope`**, không phải bằng
pixel.

> **⬜ Câu hỏi quan trọng nhất của mục này:** *dựng → xoá → thay trạng thái* có phải là ngôn ngữ
> **của 沙雕动画**, hay chỉ là thứ tôi mang sang từ một phương tiện khác? Nếu là thứ nhất,
> research 沙画 là research thật. Nếu là thứ hai, thì 5 mục 7–9 quyết định cái gì thay thế.

---

## 11. Existing Tools / Repositories — ⬜ CHƯA NGHIÊN CỨU

Không có gì. Chưa ai tìm xem đã có công cụ nào làm được không — đặc biệt là phần **pose +
expression + giọng + lắp cảnh**.

---

## 12. Chất nền RPG và cách phân xử trận — ✅ ĐÃ NGHIÊN CỨU, sâu

**Đợt 2 + 3: 34 domain · 69 agent · 10,7M subagent token.** Ở `RPG-SUBSTRATE.md` và
`.research/2026-09-30/wave3-synthesis.md`.

**Phát minh thật duy nhất của thể loại:** một cảnh giới lớn nên mua **QUYỀN** — bậc kỹ thuật
cao hơn, thêm một ô, thêm một trận pháp — chứ không phải một số lớn hơn. **Đúng một game đã
thử** (`觅长生`, không có nhân sát thương nào theo cảnh giới), và nó không phải game top-20 —
vì ảnh chụp marketing tệ hơn và bảng xếp hạng toàn cục bất khả thi. **Cả hai là sản phẩm.**

**Nếu cảnh giới mua quyền, trận phán xử thế nào?** Ba thiết bị, tất cả đã ship, tất cả có
văn bản chính thức:

1. **Hằng độ khó chọn trước và hiện trước khi nhận** — không có bảng chỉ số quái
2. **Loại sát thương có tên, bỏ qua cơ chế giảm của cảnh giới** — 「灼烧流也能**随意碾压**金丹
   天机阁修士」. Và một mod năm 2026 tồn tại **chính là để thêm** cơ chế này, vì game gốc không có
3. **Phán quyết đọc từ bộ đếm hoặc đồng hồ, không bao giờ từ so sánh**

Và cái kết quả tiêu cực sắc nhất của cả chuỗi:

> **Một trận đấu có thể không scalar. Phần thưởng thì không — vì độ hiếm là một thứ tự.**

Thể loại **chưa từng ship một trận boss không scalar**, ở bất kỳ game nào, ở cả 31 domain đã
quét.

---

## 13. Corpus tiểu thuyết — 🟡 CÓ RANH GIỚI, CHƯA TẢI

**Ba lớp, trả lời ba câu khác nhau:**

| Lớp | Lấy gì | Tác phẩm chốt |
|---|---|---|
| **canonical** | giọng văn + vốn từ | 凡人修仙传 · 仙逆 · 一念永恒 · 我欲封天 · 烂柯棋缘 |
| **hài / absurd** | cơ chế hài | 一念永恒 (chuyển sang **幽默诙谐**) · **修真聊天群** (người thường lọt vào nhóm chat mà mọi người tự xưng 府主/真人 — và họ là tu sĩ thật) |
| **shadiao-animation** | **metadata + transcript**, KHÔNG phải văn bản tiểu thuyết | xem §3 |

### Ranh giới pháp lý — đọc trước khi tải bất cứ thứ gì

`凡人修仙传`, `仙逆`, `一念永恒`, `修真聊天群` **đều có bản quyền**.

| | |
|---|---|
| ✅ **Được** | metadata · synopsis · **danh sách tên chương** · cấu trúc chương · nội dung đọc thử chính thức · trích dẫn có dẫn nguồn |
| ❌ **Không** | archive toàn văn · corpus đầy đủ · tải hàng loạt chương từ nguồn không phải nhà xuất bản |

**Metadata và tên chương gần như đủ.** Cái cần học là *tiến trình tu luyện, quan hệ, và cách một
cốt truyện được nén thành scene* — cả ba đều đọc được từ synopsis + tên chương + tóm tắt.

---

## 14. References

### Nguồn đã dùng và còn dùng được

- **Tiền lệ thương mại của nhánh 沙画** — game tu tiên 《以仙:name》 (小牛互娱, 2021) dùng
  **角色群像沙画** của 茗喆S + 方浪浪: thế giới quan, **仙魔大战**, rồi từng nhân vật hiện ra.
  ⇒ Tu tiên + ngôn ngữ hình ảnh này **đã có người mua**
- **方浪浪** — 沙画界「後浪」. 自学, lên CCTV Spring Festival Gala 2018, và bộ `红楼梦`
  dài **8 phút 57 giây**, mất **15 ngày**, và ông **không cắt**:
  「这8分57秒少一秒就少一分韵味」. Cùng nguồn: 「几分钟的一幅画，往往要花费几天的时间去琢磨」

### Nguồn chưa truy cập

- Hai danh sách Bilibili ở §3 **[chưa mở]**
- Mọi claim đánh dấu ⬜ ở trên

---

## 15. Open Questions

### Phải đo (không ai đo được)

| | Phép đo | Chi phí |
|---|---|---|
| **Tỉ lệ bước no-op của agent** | 30 lời gọi LLM, hash chênh lệch trạng thái mỗi lượt | **5 phút** |
| **`D_productive`** | cùng phép băm, ngưỡng ≥ 0,80 | 5 phút |
| **Token thật mỗi lượt** | 1.635 B chỉ là ước lượng | 1 chạy |
| **Byte thật payload người xem** | hai nguồn đo **ngược chiều nhau** | 1 projector |
| **`战力` có dự đoán sai kết quả không** | tỉ lệ thắng theo dải, đo bằng instrumentation | rẻ nhất và hữu ích nhất |

### ⚠️ Đơn vị chưa đóng — chặn mọi phép đo khác

`RECONCILIATION.md` chốt **30 s/lượt, 120 lượt/phiên**. `DESIGN-REPORT.md` §2 viết theo
**120 s/lượt, 30 lượt/phiên**. Tác giả tự ghi: *"nếu thật là 30 s, mọi tỉ lệ §2.2 chia lại 4"* —
cổng 12 lượt thành **2,5 lượt**. **Đây là cùng bệnh lần nữa, và nó vừa tái xuất hiện sau
khi vừa được đóng.**

### Sáu câu phải chốt trước khi code

1. **Chiến đấu phán xử thế nào** — đã có ba câu trả lời, phải chọn
2. **Bảng rơi đồ** — độ hiếm gắn với cái gì khi không có con số. **Chưa ai làm**
3. **Bảng gặp gỡ** — cái giá của việc cảnh giới mua quyền. **Vẫn trống**
4. **Đơn vị** — 30 s/lượt là **ước lượng của tôi**, không phải đo
5. **`award`** là hệ thống tự trao hay hành động của sư phụ
6. **Thế giới có tử thôn không, và nó thuộc đường hay thuộc ngưỡng**

---

## 16. Bằng chứng đã bị bác — đọc trước khi tin bất kỳ mục nào

**`REFUTATIONS.md`.** 109 agent, và **mọi đợt đều tự bác bỏ chính bản tổng hợp của nó.**

Bốn điều rút ra:

1. **"Đúng một" không phải bằng chứng.** Nghĩa là "đúng một trong ~15 game mà ai đó tìm thấy
   wiki". Audit 13 claim dạng này: **5 gục, 1 đứng, 6 không kết luận**, 1 hỏng tiền đề. Hai
   slot **đã bị chiếm từ năm 2016**. Đối chứng: `.research/2026-09-30/CALIBRATION-DISPROOFS.md`
2. **Nguồn bịa trong ngữ pháp đo lường hoàn hảo** là loại nguy hiểm nhất — bốn truy vấn rõ
   ràng nhất trả về bốn trang hướng dẫn bịa
3. **Một claim đúng xuất hiện một lần trong nước bẩn và một lần trong wiki thật.** Trích cẩu
   thảo thì nó trông đáng nghi
4. **Bằng chứng không nằm trong repo thì không kiểm được.** Đợt 3 không tái tạo được 3
   calibration case của chính nó vì chúng không ở đâu cả

---

## Tài liệu đi kèm

| File | Nội dung |
|---|---|
| `TERMINOLOGY-沙雕.md` | Chốt thuật ngữ + bằng chứng còn lại từ nhánh 沙画 |
| `GENRE-CANON.md` | Vực thể loại: 12 cụm · 41 hệ thống · 15 ràng buộc · 20 cái đừng copy · 9 khoảng mở |
| `RPG-SUBSTRATE.md` | Chất nền: cây vật phẩm · 16 mô hình cấp độ · 20 chỉ số · 25 quy ước phổ quát |
| `ART-DIRECTION-SHADIAO.md` | Đặc tả hướng nghệ thuật + câu hỏi nghiên cứu |
| `REFUTATIONS.md` | Mọi chỗ đã bị bác, ba đợt |
| `OPEN-QUESTIONS.md` | Phép đo và trình tự |
| `AGENT-PLAYER-DESIGN.md` | Sáu thay đổi khi agent là người chơi |
| `.research/2026-09-30/` | Raw ba đợt + calibration disproofs |
