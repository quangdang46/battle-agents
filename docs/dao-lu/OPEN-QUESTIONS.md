# Còn gì chưa biết, và đo bằng cách nào

**Ngày: 2026-09-30. 109 agent, 16,7M subagent token, ba đợt.**

Tài liệu này là **phần còn lại** sau khi đã đóng những gì đóng được. Mỗi mục có **điều gì sẽ
giải quyết nó** — và phần lớn là một tìm kiếm có tên, không phải một phỏng đoán.

> `AGENTS.md`: *"A gate that cannot fail is worse than no gate."* Cùng luật cho câu hỏi: một
> câu hỏi không có **thứ gì sẽ trả lời nó** không phải câu hỏi, nó là mối lo lắng.

> **Đợt 3 đã đóng hai lỗ hổng dưới đây — một cách nửa vời.** Đọc `REFUTATIONS.md` §3 trước
> khi đọc phần còn lại.

---

# 0. Đợt 3 đóng được gì, và không đóng được gì

**Đóng được — câu hỏi trung tâm.** Đợt 2 nói *"if nothing scales per player, encounters must
scale, and the encounter table becomes the whole game"* và không có bảng encounter. Đợt 3 trả
lời bằng **ba thiết bị, tất cả đã ship, tất cả có văn bản chính thức**:

1. **Hằng độ khó chọn trước và hiển thị trước khi nhận.** `觅长生` năm dải. **Không có bảng chỉ
   số quái nào** — cuộc chạm là một hằng đã tác giả và công bố.
2. **Một loại sát thương có tên bỏ qua cơ chế giảm của cảnh giới.** Nguyên văn `觅长生`:
   「不是技能伤害，可以无视霜冻层数…所以灼烧流也能随意碾压金丹天机阁修士」. Đây là câu trả
   lời thật của thể loại cho `境界碾压` — và **một mod năm 2026 tồn tại chính là để THÊM
   境界压制**, vì game gốc không có.
3. **Phán quyết đọc từ bộ đếm hoặc đồng hồ, không bao giờ từ phép so sánh.** Năm nguồn chính
   thức. Một trong đó đọc **ngược**: 「血量相同则**总战力低的一方获胜**」 — số nhỏ hơn thắng.

**Không đóng được — ba mục:**

- **Bảng encounter vẫn trống.** Đợt 3 đóng **cách phán xử**, không đóng **bảng gặp gỡ**.
- **Công thức sát thương của chính thể loại tu tiên không có một nguồn chính thức nào.**
  Công thức chính thức duy nhất của cả đợt là trang luật trong game của `寻道大千`. **Không có
  studio tu tiên nào phát biểu chính thức về việc họ tránh power scalar.**
- **Một nửa các con số của thiết bị 1 là content farm.** Bốn trang (9game, 老友网, TapTap,
  游民星空) in lại **nguyên văn một bài**, cùng lỗi chính tả. Hướng và chiều của 极难 và 极简
  đúng; **con số `+5 lá bài` không có trong nguồn nào**, và các con số `+1/+2/+3` thuộc về
  bảng cảnh giới và bảng 功法, **không** thuộc dải độ khó.

---

# 1. Hai lỗ hổng cũ — trạng thái sau đợt 3

## 1.1 `乘区` và công thức sát thương — **NỬA ĐÓNG**

**Vì sao là trước tiên.** Nó **lớn hơn sáu trong mười bối mục `itemTree` gộp lại**, và nó là
chỗ **cái giá của "không scale theo người chơi" thực sự được trả**. Câu một dòng của đợt 2 —
*"realm mua quyền chứ không phải số lớn hơn"* — chỉ khả thi nếu những gì thay thế nhân sát
thương là hữu hạn và đọc được. Không có `乘区`, ta không biết cái gì thay thế.

**Đã biết, chưa hệ thống hoá:**

- `铸仙之境`: tám 乘 có tên, **`暴击率 = log₂(暴击等级/抗暴等级)/4`** — chặn ở **cả hai đầu
  bằng cấu trúc**
- `我的勇者`: chuyển đổi chí mạng **ba đoạn**, trong đó đoạn giữa là **bậc hai**
- `仙境传说RO`: `元素结算 = 1 − x − 0,3(1 − sin(xπ/2)) − 0,2` — và **tại x = 0 hệ số là 0,5**
- `修仙家族模拟器2`: bảng chuyển đổi **và chỗ chế độ đảo chiều** (攻击 ≥125% → 增伤 thắng)
- **增益不锁面板** — buff đi thẳng vào sát thương cuối; **bảng chỉ số nói dối có chủ đích**

**Cần quét:**

1. Toàn bộ danh mục 乘区 đã ship, không chỉ bốn cái trên — đặc biệt: **có bao nhiêu hệ thống
   dùng log, bao nhiêu dùng clamp, bao nhiêu dùng hàm bậc hai?**
2. **Công thức nào được công bố bởi nhà phát triển**, không phải wiki. Đây là loại bằng chứng
   đợt 2 gần như không có (`REFUTATIONS.md` §2.10).
3. **Buff nào không đi qua bảng chỉ số, và bao nhiêu.** Đây là câu hỏi quyết định xem
   "bảng chỉ số nói dối có chủ đích" là tài sản hay bẫy chết với một agent.
4. **Có hệ thống nào phán thắng bại mà không đọc chỉ số tấn công của đối thủ không?**

## 1.2 Cấu trúc lượt — **ĐÓNG**

Đợt 3 đóng mục này. **Chỉ hai cấu trúc thoả ràng buộc "đơn vị là lượt" một cách sạch**, và
chỉ một được công bố trọn vẹn: **`弈仙牌`** — không free text, mọi số hạng đều công bố, hoàn
toàn rule-driven.

**Nhưng nó dính đúng lỗi của luật repo**: 修为 ở đó là **một con số làm ba việc** — nó đặt
先手, nó **chặn các bước cảnh giới** (9/21/36/55 修为 → 筑基/金丹/元婴/化神), và nó định cỡ
bộ bài. Đợt 3 gọi nó là ví dụ sạch nhất, và đó là sai.

⚠️ **Và công thức của nó đã bị sửa mà không có ngày.** Hai FAQ chính thức cách nhau hai năm:
hằng số ở 命元 đã dịch (`+0` → `+1`, `+4` → `+5`), còn slope và trần thì giữ. **Mọi con số phải
mang ngày.**

**Cấu trúc chống máy-máy tệ nhất trong corpus**: `梦幻西游` PC — **30 giây mỗi lượt, hết giờ
⇒ hành động mặc định 物理攻击, không báo lỗi.** Một hành động mặc định 30 giây **không phân
biệt được với một lựa chọn có chủ đích**.

**Vì sao là thứ hai.** Nó là chất nền thỏa ràng buộc **"đơn vị là lượt"** của chính dự án —
và **đã được giải, hai lần, bằng số đã công bố**.

**Đã biết, chưa hệ thống hoá** (`REFUTATIONS.md` §2.2):

| Nguồn | Cấu trúc |
|---|---|
| 指尖修仙 (2017) | 回合制, trần 60 lượt, **hòa thì bên phòng thủ thắng** |
| 无极仙途 (2024) | 30 lượt, không giết là bên công thua |
| 剑侠情缘95 (2001) | Bậc trật tự là thuộc tính **cả đội**, 行动系数 合击 10 … 攻击 1, **địch mọi hành động đều = 1** |
| 一起来修仙 | Tốc độ dẫn trước ~10% thì chắc chắn đi trước; buff **đếm theo lượt**; **pet luôn đi trước người chơi** |
| 指尖修仙 | **Mỗi 6 lượt một khối**, màn xếp thứ tự ở đầu trận và cuối mỗi khối, **tự chọn sau giới hạn chờ** |

**Cần quét:** toàn bộ cấu trúc lượt đã ship. **Đặc biệt là câu hỏi đã bị bỏ**: 境界 bị cài
vào bậc trật tự như thế nào, và **vì sao ngành gỡ nó ra giữa 2001 và 2024** — `剑侠情缘`
cho thấy nó bị gỡ có chủ đ, và câu xu hướng đó là câu có giá trị nhất của đợt 2.

## 1.3 Kiểm toán lại mọi "đúng một" — **ĐÓNG, KẾT QUẢ TỆ HƠN DỰ ĐOÁN**

Đợt 3 audit 13 negative bằng **phương pháp nguồn thứ hai khác hẳn** — không phải "tìm
mạnh hơn cùng một loại wiki", mà là: wiki tiếng Anh, trang chiến lược của nhà phát triển,
tài khoản TapTap chính thức, văn bản nguyên văn tiểu thuyết, trang chính thức qua nhiều
thời đại.

**Nó tự hiệu chuẩn trước**: tái tạo **4/4** phản ví dụ đã biết. Bốn phần bác bỏ nằm ở
`.research/2026-09-30/CALIBRATION-DISPROOFS.md` — **đọc tệp đó trước khi tin audit nào.**

**Kết quả: 5/13 gục, 1 đứng, 6 không kết luận, 1 hỏng tiền đề.**

| | Negative | Phán quyết |
|---|---|---|
| N2 | Chấm hòa tất định theo trạng thái đã cam kết | **ĐÃ CÓ — bằng bốn nguồn chính thức.** `九阴真经`: 「双方均未死亡，则击打伤害量较高者获胜；**击打伤害量相同则记为平局」」 |
| N10 | Quy tắc tự động tướng ghế sau hai tuần offline | **ĐÃ CÓ, SAI CẢ MỘT LẦN NỮA** — là **game đã ship từ 2016**, trên trang chính thức 完美世界. Và **không có tài sản nào dịch chuyển**; đó là kế nhiệm lãnh đạo với điều kiện 10 ngày |
| N13 | Ngân sách chi trong chiến đấu | **ĐÃ CÓ, chính thức.** `梦幻西游手游` 的 法宝灵力: 6 điểm, +1/lượt, trần 8, giá 6/5/4 |
| N7 | 五衰 chưa thành lịch | **ĐÃ THÀNH** — thông báo chính thức `一念逍遥`: trần 8000 tầng, mở sau 50 kiếp, cho phép đuổi 100 lượt, trần 10/ngày |
| N12 | 聚灵阵 độc nhất | **ĐÃ CÓ ÍT NHẤT HAI** — `涅槃` ba bậc xây từ 阵旗, thuần sức chứa |
| N1 | Đúng một game mua quyền thay vì số | **Đảo về số lượng** — `诛仙手游` chính thức chặn 功法 theo cảnh giới. Vế "thay vì số" **chưa được giải quyết** |
| N9 | Đúng một game miễn nhiễm tử thôn | **ĐỨNG về số lượng — nhưng là LORE, không phải luật.** Câu đó nằm ở trang thế giới, trang cơ chế không lặp lại. **Đừng xây cơ chế lên câu này** |
| N6 | Cửa sổ 5 năm / 5 ngày chưa ai dùng | **KHÔNG KIỂM ĐƯỢC — tiền đề hỏng.** Không report nào trong chuỗi **từng trích văn bản gốc** của phong ấn đó. **Không xây gì lên nó** |
| N3, N4, N5-log, N8, N11 | — | **Không kết luận** |

**Và cái đảo ngược tri thức mà nó tạo ra:** vì 4/4 phản ví dụ tái tạo được **trong một lần
tìm kiếm**, một negative **sống sót** yếu hơn một negative **gục**. Nhưng đó là mệnh đề hẹp —
*"sống sót qua một lần tìm kiếm **mà lần đó cũng tìm ra bốn cái biết-đúng**"* — và cơ chế có
**vòng tròn**: tìm kiếm được chọn bởi chính các negative nó kiểm tra.

**Hai slot đã bị chiếm** (N2, N10). Đó là phát hiện hữu ích nhất của cả audit: hai slot ta tưởng
còn trống **đã có người ở đó từ năm 2016**.

**Quy tắc viết vào tài liệu:** *"đúng một" không phải phán quyết. Nó là "đúng một cái tôi
tìm tới".* Điều chỉnh được viết bằng tiếng Nhật, nguồn Hàn, tài khoản nhà phát triển, hoặc
văn bản nguyên văn — **không phải** "tìm mạnh hơn".

---

# 2. Số phải đo, và phép đo

Không nghiên cứu nào trên đời đo được những thứ dưới đây. Chúng ta có thể đo.

## 2.1 Tỉ lệ bước no-op của agent

| | |
|---|---|
| **Trạng thái** | **CHƯA BIẾT.** RedundancyBench gán nhãn 8.000+ bước bởi sáu chuyên gia và **không nêu tỉ lệ nền** |
| **Phép đo** | 30 lời gọi LLM, **hash chênh lệch trạng thái** mỗi lượt |
| **Chi phí** | **5 phút** |
| **Vì sao quan trọng** | Nó quyết định `D_productive`. Đợt 1 đặt ngưỡng ≥ 0,80; đợt 2 cho thấy thể loại không đo ở đâu |

## 2.2 `D_productive` của thiết kế này

**Cùng phép băm.** Tỉ lệ lượt có **ít nhất một field thế giới đổi giá trị**, trên mọi cửa sổ
trượt 30 lượt. **Ngưỡng ≥ 0,80.**

⚠️ **Cảnh báo đơn vị chưa đóng.** `RECONCILIATION.md` chốt **30 giây/lượt, 120 lượt/phiên**.
Phần 1–3 của `DESIGN-REPORT.md` viết theo **120 giây/lượt, 30 lượt/phiên**. Tác giả tự ghi:
*"nếu thật là 30 s, mọi tỉ lệ §2.2 chia lại 4"* — **cổng 12 lượt thành 2,5 lượt.**

⇒ **Đây là cùng bệnh lần nữa**: đơn vị được suy ra ở nhiều chỗ, và nó vừa tái xuất hiện
**sau khi vừa được đóng**. Không sửa trước khi đo, mọi phép đo sẽ ra con số không có nghĩa.

## 2.3 Chi phí token thật mỗi lượt

1.635 B/lượt là **ước lượng**. Chạy 30 lượt với tokenizer thật.

## 2.4 Số byte thật của payload người xem

Hai nguồn đo **ngược chiều nhau**: một nói payload người xem **nhỏ hơn** agent
(325 B < 401 B), một nói **lớn hơn 22%**. **Chỉ một cách chạy với một projector mới chấm.**

## 2.5 `bottleneck điểm yếu tập thể` có thật không

| | |
|---|---|
| **Về** | Có game nào **thật sự** dùng cửa sổ 5 năm / 5 ngày như một lớp phối hợp **tái diễn** không? |
| **Tại sao vẫn chưa** | Bản tổng hợp biết nó dựa trên **một chương của một tiểu thuyết** |
| **Cách giải** | **KHÔNG phải** quét patch notes (đó là hướng tìm sai mà tài liệu liệt kê). Đi vào `洪荒` 的 **量劫** — một bảng cố định, công bố, liệt kê được, có chu kỳ — và `封神` 的 **劫运之轻重**. **Cả hai đã nằm trong tay**, cùng hình dạng, và không cái nào được nhắc |

## 2.6 战力 có dự đoán sai kết quả không

| | |
|---|---|
| **Về** | Đây là **tính chất thể loại** hay một quirk của một game? |
| **Bằng chứng** | Chỉ một trận do người chơi báo |
| **Cách giải** | **Tỉ lệ thắng theo dải 战力, đo bằng instrumentation.** Không studio nào công bố và không ai chạy |
| **Vì sao rẻ** | Đây là **thứ rẻ và hữu ích nhất ta có thể đo** |

## 2.7 Danh sách 洞天/福地

Ba cách liệt kê mâu thuẫn nhau; `杜光庭` 的 福地 có **71** mục. **Có danh sách cố định không?**

## 2.8 贡献点 có không-chuyển-nhượng không

Chứng kiến duy nhất là **một trang bách khoá tự sinh**, và một tiểu thuyết chạy ngược lại.
Cách giải: văn bản chính thức của bất kỳ game nào có **cấm chuyển đổi giữa hai loại tiền**.

## 2.9 妖丹 có thật là động cơ hai mặt không

Một tiểu thuyết nói thẳng. **Có game nào ship nó như một hệ thống chứ không phải một nhịp cốt
truyện không?** Cách giải: một hệ thú nuôi mà việc thu hoạch **đo được** làm giảm tốc độ tăng
trưởng của chính tài nguyên đó.

---

# 3. Câu hỏi về LLM — nơi tôi nói quá chắc

| Câu hỏi | Trạng thái |
|---|---|
| **"LLM không bao giờ hội tụ"** | **KHÔNG PHẢI LUẬT.** `arXiv:2603.18563` chứng minh agent hiện thực **dưới dạng mẫu hậu xác suất Bayes** thì **được bảo đảm hội tụ gần Nash** trong game lặp vô hạn, với Qwen 3.5-27B. Nó là thuộc tính của agent dùng sẵn dưới protocol cụ thể. **Tôi đã đông cứng nó thành ràng buộc tuyệt đối** |
| **Ba trích dẫn LLM** — `2609.02580`, `2509.09071`, `2604.11840` | **Không khớp** với tài liệu truy cập được. Không kết luận là bịa; kết luận là **các phát hiện như đã nêu không phải điều tài liệu nói**, và ba ràng buộc được viết bằng ngữ pháp đo lường |
| **"Người bán nhượng quá mức"** | `arXiv:2506.00073`: hiệu ứng nhượng bộ có thật, **nhưng điều kiện theo ngân sách** và đi qua **tiết lộ ngân sách**. Tôi gán một hiệu ứng hình dạng người-mua cho người-bán **và bỏ mất tiền đề** |
| **Agent có xếp hạng vector chỉ số ổn định không** | **ĐÃ CÓ ĐÁP ÁN.** `LISTEN` (arXiv 2510.25799, IJCAI-ECAI 2026): bộ tổng hợp LLM **bằng hoặc vượt** baseline tuyến tính tất định. `DecompR` (arXiv 2605.26878): **trôi trọng số, tăng theo số tiêu chí.** Cần: **cố định trọng số trước khi chấm** |
| **Sổ lệnh có thất bại không** | Nó hội tụ. **Chế độ thất bại là CARTEL ÂM THẦM**: dưới 8 agent mỗi bên, HHI > 2500 ở **73% lượt chạy**, **không giao tiếp**, thuần best-response. **Cần dân số tối thiểu mỗi công cụ, hoặc một tick ngẫu nhiên** |
| **Mô hình có bị chi phối bởi tier không** | `arXiv:2512.09254`: có thứ hạng thống trị ổn định giữa model. **Nếu đàn agent của ta đa mô hình, sức mạnh model là một lợi thế ẩn — đúng trong toạ độ mà tử thôn được cho là miễn nhiễm** |
| **Nature 2025 có áp được cho một thế giới 50 agent bền vững không** | Nó nói về Trò chơi Nhân tài lặp lại trong thí nghiệm có kiểm soát. **Đây là một bước nhảy loại mà tài liệu không gắn cờ** |

---

# 4. Hệ thống bị bỏ sót — đã biết, chưa quét

| Hệ | Vì sao quan trọng | Nguồn đã có |
|---|---|---|
| **Nhiều phiên** | `DESIGN-REPORT.md` tự thừa nhận *"zero evidence"*; đây là phụ thuộc trung tâm của cả dự án. Bốn kho world-side: ledger, threads, claims, front_state | — |
| **Hành vi NPC/AI** | Người chơi là agent ⇒ NPC phải **đọc được và không gian lận được**. **Không domain nào trong hai đợt chạm vào đây** | — |
| **Khám phá xã hội** | Agent gặp agent lần đầu ra sao, trong game tu tiên có cơ chế nào không | `圣魔之血`: điều kiện **hai người, hai giới tính, đã kết bạn** — và đó phải vào danger list |
| **Replay và khán giả** | Phần 7 của `DESIGN-REPORT.md` đã có, **chưa qua kiểm chứng đối chứng** | — |
| **Inspectability / tooltip** | Khuyến nghị chính của đợt 2 là **"công bố công thức"**, và nó **không có một hệ thống nào cho việc game làm lộ trạng thái ra sao** | — |
| **Sức chứa hành trang** | Nhóm 2 đã tìm ra `储物袋`; cơ chế **từ chối cứng** chưa được quét rộng | — |
| **Nhập môn / dạy luật** | Thể loại bị chê nặng nhất về tutorial. Không ai đo cách một agent **học luật** | — |
| **Âm thanh / hoạt ảnh** | Thảm họa cho một game PixiJS trên trình duyệt, và **không một dòng nào** trong hai đợt | — |
| **Chuỗi chế tạo thứ hai** | 炼器 bị coi là một phần của 装备, thay vì **chuỗi sản xuất song song thứ hai** bên cạnh 炼丹 | — |

---

# 5. Thứ phải chọn trước khi code

Không phải câu hỏi nghiên cứu. Đây là những cái mà **research không trả lời được**, và chỉ
một người quyết.

| # | Câu | Vì sao nó chặn mọi thứ khác |
|---|---|---|
| 1 | **Chiến đấu được phán xử thế nào?** | `DESIGN-REPORT.md` chốt **không nhân sát thương theo thang cảnh giới**. Nhưng vậy thì cái gì phán? Nếu câu trả lời là "so sánh tổng sức mạnh", ta đã dựng lại scalar |
| 2 | **`award` là hệ thống tự trao hay hành động của sư phụ?** | Đổi cả vị trí code lẫn nghĩa của 貢獻點 |
| 3 | **`TURN_WALL_SECONDS = 30` có đúng không?** | Quyết định **mọi** tỉ lệ khác, và nó là **ước lượng**, không phải đo |
| 4 | **Thế giới có tử thần không, và nó thuộc đường hay thuộc ngưỡng?** | `极光世界` nói 丹修 **không bao giờ** gặp tử thôn. Đó là tiền lệ ship. Nhưng ta chọn cái nào? |
| 5 | **Đỉnh thang là một quyết định hay một điểm đến?** | Nếu là điểm đến, cần một scalar. Nếu là quyết định, cần một tiền tệ chi phí khác với tiền tệ phần thưởng |
| 6 | **Người chơi đến muộn thấy gì?** | `critic.md` mở đầu bằng câu hỏi này và mọi quyết định còn lại rẽ theo nó |

---

# 6. Đề xuất trình tự — sau ba đợt

1. **Đóng đơn vị** (§2.2) — **trước mọi phép đo khác.** Đo sai đơn vị thì tất cả con số còn
   lại vô nghĩa. **Vẫn chưa làm.**
2. **Bảng encounter** — lỗ hổng duy nhất của đợt 3 mà nó tự thừa nhận. Đây là **cái giá** của
   việc "cảnh giới mua quyền chứ không mua số".
3. **Bảng rơi đồ** — thế loại **chưa từng** ship một trận boss không scalar, vì **độ hiếm là
   một thứ tự**. Đây là slot mở thật sự duy nhất mà ba đợt tìm ra. Xem
   `.research/2026-09-30/wave3-synthesis.md` §legitimatelyOpen #1.
4. **Đo** §2.1 và §2.6 — năm phút và một lần instrumentation.
5. **Chốt sáu câu** ở §5.
6. **Chỉ khi đó**: viết lát cắt dọc đầu tiên.

---

# 7. Lỗi của chính đợt 3 — đọc trước khi dùng nó

Critic của đợt 3 tìm ra năm lỗi, và một cái trong số đó là lỗi của tôi:

**E0 — bằng chứng của đợt 3 không có trong repo khi nó chạy.** Tổng hợp là một **văn bản mồ
côi**, không mở được để kiểm lại, và nó không thể tái tạo 3 calibration case vì chúng không ở
đâu cả. **Đã sửa**: `.research/2026-09-30/` nay có synthesis, audit, critique, và
`CALIBRATION-DISPROOFS.md`.

**E1 — trích dẫn chính cho câu trả lời trung tâm sai một nửa.** Đợt 3 viết rằng 灵兽 của
`寻道大千` "bỏ qua 防御 **và** cả 增伤/减伤". Nguyên văn công thức:
`… ×(我方实际增伤 − 目标实际减伤)…` — nó **tiêu** chúng. Đơn vị bỏ qua cả hai là **精怪**.
Đồng thời, biểu thức nền của game là
`(最终攻击力 − 目标最终防御力) × (1 + 增伤 − 减伤) × (1 + 鬼将值)` — **đúng là
difference-of-aggregates**, mà chính `scalarEnforcement` #1 của đợt 3 gọi là *"hình dạng phổ
biến nhất và khó đọc nhất"*, và nó đặt `寻道大千` lên đầu.

**E2 — số của thiết bị 1 là content farm.** Bốn trang in lại một bài. Hướng và chiều đúng;
**con số không có trong nguồn nào**, và `+1/+2/+3` thuộc bảng cảnh giới và bảng 功法.

**E3 — "Không studio nào nói" là sai.** Quy tắc kết hợp của 原神 vs 崩坏 **đã được nói rõ và
đối chiếu** từ 2023: 「在原神中，减防与无视防御**乘算**，相互稀释，而在星穹铁道中，减防与无视防御
**加算**，相互反稀释」. Claim đúng phải hẹp lại: *không studio nào hiện nó trong game; nó chỉ
tồn tại trong wiki cộng đồng.* **Và đó là một thắng lợi tài liệu, không phải một khoảng trống
thiết kế.**

**E4 — nhầm hai mức suy giảm.** Cả 50/30/10 và 0,5ⁿ đều là **thứ tự**. Đối lập thật là
**có chặn và không chặn**, không phải "thứ tự và không".

**E5 — công thức của `弈仙牌` đã bị sửa mà không có ngày.** Hằng số ở 命元 đã dịch giữa hai FAQ
chính thức cách nhau hai năm.

---

# Nguồn

Hai đợt nghiên cứu 2026-09-30. Bổ sung `RECONCILIATION.md` (sáu mâu thuẫn đã đóng),
`AGENT-PLAYER-DESIGN.md` §7.4 (bài test có đáp án là một số).
