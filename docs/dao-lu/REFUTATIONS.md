# Bác bỏ — những chỗ nghiên cứu Đạo Lộ đã tự đánh lừa mình

**Ngày: 2026-09-30. 76 agent, 11,2M subagent token, hai đợt.**

Tài liệu này là **phần đáng đọc nhất** của cả hai đợt nghiên cứu, và nó nằm ở đây vì
lý do mà `.research/critic.md` từng nói trước:

> *"A refutation pass keyed on 'was the number wrong' cannot touch a decision that has no
> number."*

Hai đợt nghiên cứu sau đó lặp lại đúng cái bẫo đó, **trên chính bản tổng hợp do chúng
sinh ra**. Mỗi đợt đều kết thúc bằng một critic đọc nguyên văn tài liệu tổng hợp và
tìm ra lỗi ở tầng nguồn. Dưới đây là những lỗi đó, giữ nguyên sắc độ.

---

## Cách đọc tài liệu này

Mỗi mục có một nhãn:

| Nhãn | Nghĩa là |
|---|---|
| **BẮC** | Claim sai. Có nguồn đối chiếu. Đừng dùng. |
| **ĐẢO** | Claim đúng nhưng lập luận dựng trên nó thì không. |
| **VỠ** | Claim đúng nhưng mang nhiều kỳ vọng hơn bằng chứng. Hạ cấp xuống giả thuyết. |
| **THỪA** | Không ai cần nó. |

Và một quy tắc đọc, áp dụng cho mọi mục:

> **"Đúng một game"** trong hai bản tổng hợp nghĩa là *"đúng một trong ~15 game mà ai
> đó tìm thấy wiki"*. Đó là **tần suất mẫu**, không phải tần suất thế giới. Critic
> đã kiểm toán đúng một negative (`ACS 品阶`) — **nó sai**, và sinh ra ba artefact dẻ
> xuống. Chính bản tổng hợp ghi nhận điều đó rồi không tổng quát hoá.

---

# ĐỢT 1 — CRITIC

## 1.1 BẮC — `云墟修仙录` bị trích sai, và nó mang hard constraint quan trọng nhất

Bản tổng hợp viết:

> *"云墟修仙录's official guide, from 金丹 onward every tribulation resolves on one line:
> 胜负只看一条：你的战力 ≥ 雷劫战力就成功，否则必败"*

và dựng cả danger entry đậm đặc nhất lên đó — *"This is the purest instance of the failure
in the entire sweep, and it ships."*

**Game không làm vậy.** `云墟修仙录` là **休闲/文字 Roguelike** của 云墟仙途工作室 (studio
đứng sau 养娃模拟器), phát hành TapTap, **10–20 phút mỗi lượt**. Hướng dẫn thật của nó
trên diễn đàn nhà phát triển tài liệu **bảng xác suất ba kết quả**:

| 战力 (% mức cần) | 成功率 | 死亡率 |
|---|---|---|
| 100% | 80% | 0% |
| 85% | 62% | 8% |
| 70% | 40% | 20% |
| <50% | 大概率死 | — |

Cộng talent mua được: **万劫雷池: 渡劫门槛降低20%**.

Đó là **bề mặt xác suất trên một tỉ lệ, có giảm nhẹ mua được** — không phải một phép so
sánh nhị phân. Câu tôi trích **không có trong văn bản game**; nó là diễn giải từ diễn
đàn, và bản tổng hợp gán nó là *"official"*.

**Hệ quả theo thứ tự thiệt hại:**

1. **Hard Constraint #2 mất chứng cứ.** Tuyên bố *"tử thần không được phán bằng so sánh
   ngưỡng"* vẫn **có lý** — nhưng bằng chứng của nó bây giờ không dùng được. Và
   nguồn bản gốc duy nhất phán tử thôn **không theo ngưỡng** (mục 1.2) làm cho lập luận
   đứng vững hơn.
2. Con số *"at least six shipped games"* không kiểm chứng được, và game được nêu tên
   không nằm trong sáu cái đó.

**Cùng game, phát hiện tệ hơn, tìm thấy trong cùng nguồn — nhưng bản tổng hợp tìm thấy
phiên bản mềm hơn và gán nhầm cho 诛仙:**

> 「心魔别超过 60… 心魔到 100 会触发正道通缉，下次出门就有一个大佬来砍你，**战力比你高
> 2000，基本必死**」

Một số nguyên ẩn vượt 100 triệu ra một kẻ thù có **lợi thế +2000 sức mạnh** — một án
tử do con số mà người chơi **không hề được báo là mang tải**. Đây phải đứng đầu
danger list, gán đúng nguồn.

## 1.2 BẮC — `封神演义` CÓ điều khoản tử thần, và nó gắn với **việc đã làm**

Bản tổng hợp viết: *"the three root traditions use incompatible tribulation cadences
(封神 has no 三灾 at all and runs 1500 years…)"*. Hard Constraint #4 dựa một phần lên đó.

Critic mở `封神演义` chương 99 trên ctext.org và Wikisource. Nguyên văn:

> 「縱服氣煉形于島嶼，未曾斬卻三尸，**終歸五百年後之劫**；總抱真守一于玄關，若未超脫陽神，**難赴三千瑤池之約**。」

Ba lỗi trong một câu:

- **"no 三灾 at all"** — sai; văn bản có 劫, và đã mệnh danh.
- **"runs 1500 years"** — không có cơ sở; con số văn bản đưa là **500 và 3000**.
- **"no shared number to inherit"** — các truyền thống **gần nhau hơn** bản tổng hợp nói.

Và cái bản tổng hợp **bỏ lỡt**: `封神` còn nói rõ cơ chế cưỡng chế —

> 「**有功之日，循序而遷**」 — thăng chức **theo công trình**.

Và nó gắn điều kiện vào **việc đã hoàn thành** (斬三尸 / 陽神), **không phải một giá trị
sức mạnh**.

⇒ **Đây là bài kiểm tra tử thôn chống scalar, nằm trong nguyên văn gốc thế kỷ 16 — trong
chính tác phẩm mà bản tổng hợp dùng làm bằng chứng phủ định, ba lần.**

## 1.3 THỪA — `封神` chương 99 còn chứa bảng vai trò, và nó bị bỏ

Cùng chương, critic đọc tiếp:

> **三百六十五位正神**, liệt kê đầy đủ chức vụ, xếp hạng tám bộ theo 「劫运之轻重」 và
> 「资品之高下」, với **黄飞虎 giữ quyền phán đoán toàn bộ sinh tử biến cải** —
> 「凡应生死转化人神仙鬼，俱从东岳勘对方许施行」.

Đây là **bảng vai trò cố định, công bố, liệt kê được, phân cấp theo công trình, cộng
một chức vụ phán đoán có tên**. Đó là hệ thống phân vai chống scalar, kiểm tra được bằng
máy, của chính thể loại — và tổ nguồn trực tiếp của `封神榜` trong văn hóa 洪荒.

## 1.4 BẮC — Ba trích dẫn về LLM không khớp, và có phản chứng

Bản tổng hợp dùng tám hard constraint, và ba cái được viết **bằng ngữ pháp đo lường** (số
đếm cụ thể, phần trăm cụ thể). Critic **không khớp được**:

- `arXiv:2609.02580` (11 người mua / 11 người bán / bảng giá công bố)
- `arXiv:2509.09071` (người bán nhượng bộ quá mức)
- `arXiv:2604.11840` (5 agent, 15 lượt, 314/315, 0/135 khi bật suy luận)
- một paper *Nature Human Behaviour 2025* mang tên đó

Không kết luận là bịa. Kết luận là: **các phát hiện như đã nêu không phải điều tài liệu
tôi truy cập được nói** — và điều đó quan trọng, vì ba ràng buộc được viết bằng ngữ pháp
mà tài liệu cảnh báo.

**Tài liệu thực sự nói, và nó cắt hai chiều:**

**Phản chứng trực tiếp.** `arXiv:2603.18563` chứng minh agent LLM hiện thực **dưới dạng
mẫu hậu xác suất Bayes** thì **được bảo đảm hội tụ gần Nash** trong game lặp vô hạn, với
Qwen 3.5-27B qua năm môi trường gồm cả Trò chơi Nhân tài.

⇒ **"LLM không bao giờ hội tụ" không phải luật.** Nó là thuộc tính của agent dùng sẵn dưới
protocol cụ thể. Bản tổng hợp **đông cứng nó thành ràng buộc tuyệt đối** mà không nêu định
lý chỉ tay ngược lại.

**Phát hiện hữu ích hơn cái được báo.** `arXiv:2512.09254` ("The Illusion of Rationality",
NegotiationArena): mô hình **phân kỳ vào các cân bằng riêng theo model** thay vì hội tụ,
đề xuất **co cụm quanh các mốc tròn** (bội số của 5), và có **thứ hạng thống trị ổn định
giữa các model**. Phần neo mốc làm cho thiết kế của ta **dễ hơn**, không khó hơn: giá niêm
yết sẽ co cụm quanh số tròn, đó là lý do **có** sổ lệnh.

**Và cái bản tổng hợp không nêu, là đáng giá nhất:** một nghiên cứu tiền in (clawrXiv
2026.00007 — **coi là chưa kiểm**, số quá sạch) với **1.024 agent / 16 hàng hóa / 50.000
vòng**: chế độ **đấu giá liên tục hội tụ trong 3,2%** của cân bằng cạnh tranh, còn chế độ
giá niêm yết thì **không** (lệch 11,7%, người bán định giá quá 8–15%).

Và nó nêu đúng cái **chế độ thất bại** mà khoảng trống "công bố độ sâu" của bản tổng hợp
không hề biết: **hội tụ thành cartel âm thầm ở thị trường mỏng** — dưới **8 agent mỗi
bên mỗi hàng**, HHI > 2500 ở **73% lượt chạy**, **không hề giao tiếp**, thuần best-response.

⇒ **Nếu ta ship sổ lệnh, kẻ giết ta không phải thị trường chết — mà là một bè cartel
không ai nói.**

## 1.5 BẮC — Nội dung bịa ở dạng **đúng** ngữ pháp đo lường

Bốn truy vấn rõ ràng nhất của critic trả về **bốn trang hướng dẫn bịa đặt**:

- `星辰变2` (rpcyzx.com): một sự cố rò rỉ dữ liệu "2026年2月官网后台", một URL
  `官网/weather/forecast`, ngưỡng "38 điểm", biên 4,7×, và khai thác kênh hỗ trợ với tỉ lệ
  bồi thường 23%.
- `33games.com.cn`: trích một báo cáo **không tồn tại** — 《修仙品类游戏数值模型深度分析报告》
  — với "68.3% of failures occur on attempts 3–5".
- `biligame.com.cn`: bảng phân rã 战力 sáu module, 抗性 45% vs 基础属性 15%, công thức,
  ví dụ tính, và chú thích ghi **"内部测试服数据"**.

**Và đây là điều bản tổng hợp nói sai về loại nguy hiểm.** Nó cảnh báo chỉ với *"a claim with
NO number but written in the grammar of a measurement"*. Loại nguy hiểm hơn, và là loại
critic **thật sự dính**, là **ngược lại: một con số bịa đặt trong ngữ pháp đo lường hoàn
hảo** — thứ lọt qua **mọi** kiểm tra mà bản tổng hợp liệt kê.

Và có một phát hiện thật giấu trong đống rác đó: **claim** của trang bịa (有效战力 ≠ 战力,
con số hiển thị không dự đoán kết quả) **trùng khớp một hệ thống có thật, có trên wiki**.
**Cùng một claim đúng, xuất hiện một lần trong nước bẩn và một lần trong wiki thật.** Cách
xử lý đúng: báo cáo wiki, vứt nước bẩn, và ghi rõ rằng sự tồn tại của nước bẩn khiến claim
sẽ **trông đáng nghi nếu trích cẩu thảo**.

## 1.6 ĐẢO — "境界 không phải scalar" là một ngụy biện

Lập luận của bản tổng hợp: *"品阶 sits on the OBJECT and 境界 on the PERSON, which is exactly
why the genre never needed a power number."*

**Không suy ra được.** 境界 **có trật tự toàn phần trên người** — đó là định nghĩa của một
thang bậc. Đặt phẩm cấp lên vật thay vì người **không thủy chung con số**; nó **chia con số
làm hai và làm phần trên người khó gỡ hơn**.

Luật trong repo được thoả bằng **cổng năng lực**, và bản tổng hợp **tự đề xuất** ở đúng
đoạn văn đó — rồi không áp dụng nhất quán. Mâu thuẫn này **chịu tải**, vì toàn bộ giáo lý
chống scalar được lập luận từ nó.

## 1.7 ĐẢO — "đúng một" sai ít nhất ba lần

| Claim | Thực tế |
|---|---|
| Artifact-as-claim chưa ai làm | **完美世界** đang **bán** nó: trang chính thức 诛仙2 (2024) nói 道无为学府 **「不以提升战力为导向」**, 仙枢师 **「可以根据修仙者的具体需求定制法宝属性，为法宝适配不同资质」** |
| Lịch thế giới chưa ai công bố nhịp | **修仙家族模拟器** patch 11.0.6: 天材地宝 **30 năm** một chu kỳ; chu kỳ thứ hai **100 → 50 năm**; xác suất mỗi đảo **0,5% → 1%**; **trần toàn cục 3 → 6** |
| Đỉnh thang là gánh nặng chưa ai làm | **云墟修仙录**: 春秋蝉 trần **3 tự hồi sinh**, **「每复活下降1个大境界」** — vật phẩm đỉnh **đưa bạn ra khỏi tầng** |

Cột đầu đúng hơn bản tổng hợp nói: custom-stats-and-reroll là **phiên bản tệ hơn** của đề
xuất của nó (một claim có điều kiện). Nên *"không ai làm **phiên bản tốt**"* còn đúng.

## 1.8 ĐẢO — "Bị cắt như một drain" là lỗi phạm trù

Bản tổng hợp cắt cả họ kinh tế cạn kiệt, dựa trên:

> 「灵脉成形后便会自动散发出淡淡的灵气，让当地的灵气循环不绝，不会有枯竭之日」

Nhưng câu đó nói về **灵脉** — một **tính chất nơi chốn**. Bản tổng hợp khái quát từ *"nơi
chốn thì tái tạo được"* sang *"không nơi nào cạn"*, và xoá mất phần kinh tế thực sự vận
hành. `修仙家族模拟器` ship **不可再生矿石 (混沌金精, 赤炎晶) vs 可再生 (灵石矿洞)** như một
phân biệt được đặt tên, và patch 11.0.6 có **fix bug "矿藏耗尽后重复开采…造成透支或重复产出"**.
Game chạy mạch khoáng cạn và coi đó là thiết kế.

Và một dạng bị cắt mà không được gọi tên: **`凡人修仙` 的灵石矿洞 — 2 lượt miễn phí/ngày,
20 phút mỗi lượt, bản đồ PvP tự do, cướp được một phần khoáng của người chơi khác.** Tài
nguyên tranh chấp có thời hạn, giới hạn sức chứa, tranh chấp PvP — đúng dạng drain nguy hiểm
nhất với agent. Nếu ta ship tài nguyên tranh chấp, đó **là dạng phải từ chối**, và bản tổng
hợp từ chối **nhầm thứ**.

## 1.9 ĐẢO — Mâu thuẫn nội tại về 寿元

Canon map nói *"寿元 is a CONSEQUENCE of 境界, not the scalar"*; inventory nói
**SHOULD_CUT**; Hard Constraint #4 cấm đồng hồ tính bằng năm. **Ba vị trí, một hệ thống.**

Cách hoà giải mà critic đưa ra và đã kiểm: **cắt 寿元 như một hạn chót; giữ nó như một tài
nguyên để mua hành động.** Bằng chứng: `云墟修仙录` bán **50000 灵石 cho 50 năm** — một
**cuộc đấu giá**. Đó là *mua* tính bằng năm, không phải *cổng* tính bằng năm, và là cơ chế
duy nhất về tuổi thọ trong toàn bộ sweep mà agent hành động được.

## 1.10 ĐẢO — "Bằng chứng cho capacity-typed place grade là scalar"

Claim *"already half-built"* dựa trên hướng dẫn nói luật sức chứa **đồng thời mang điều
khoản dự phòng theo sức mạng** — chính điều khoản mà tác giả đã loại. Một thiết kế có bằng
chứng là điều khoản tác giả vứt bỏ thì **chưa được dựng**, chứ không phải dựng nửa vời.

**Thay bằng:** `打工修仙记` 的布阵 — mảng deploy được duy nhất là 聚灵阵, tác dụng
**灵气浓度 → 修炼速度**, và bài viết trên diện độ nhà phát triển gọi nó **「过于鸡肋，不推荐」**.
Một sản phẩm định-kiểu-sức-chứa đã ship, **không sinh con số sức mạnh nào**, và bị chính
tác giả của nó đánh giá là yếu.

## 1.11 ĐẢO — Bẫy cộng dồn chưa được gọi tên

`剑侠奇缘` hướng dẫn chính thức: mỗi điểm kinh mạch hoàn thành cho **phần trăm** cộng thêm,
và hướng dẫn khuyên **trì hoãn vài điểm cuối** cho tới khi trang bị mạnh hơn
*"以获得更大的实际收益"*.

Một chỉ số là **phần trăm của phần trăm** là cách game dựng lại scalar từ bốn cái nhỏ. Nếu
ta lấy nhiều cổng năng lực, đây là chế độ thất bại phải đặt tên: **không cổng nào được trả
về một phần trăm của đầu ra của cổng khác.**

## 1.12 Hệ thống bị bỏ sót — đây mới là tin thật

### 内丹 — xương sống thật, và nó là **MẠCH**, không phải thang

Cả bản tổng hợp lấy 境界 làm xương sống. **Truyền thống không.** Truyền thống lấy
**内丹**: một mạch tuần hoàn **có cổng có kiểu và động từ có kiểu**.

- Cấu trúc: **筑基 → 炼精化气 (小周天) → 炼气化神 (大周天, 十月养胎) → 炼神还虚**
- Ba cửa: **百日关 / 十月关 / 九年关**; các cổng **三关: 尾闾 → 夹脊 → 玉枕**
- Ở 尾闾, khí có **bốn lối ra và 谷道 là lối chết** — rò ra là mất đan
  (「大药走失，最能伤人」)
- Mạch là **任督**, mở bằng **河车通**
- Động từ là **火候**, không phải đại lượng: **武火 / 文火 / 沐浴 / 止火**, với 十二消息卦
  và 进阳火/退阴符. 《灵宝毕法》 chia thành **mười ba 法门**

**Vì sao đây là tin tốt nhất của cả đợt:**

1. **筑基** — cái bản tổng hợp coi là một **bậc** — theo nguyên văn **là hành động mở một
   mạch**. Thể loại thứ hai của nó *đã là* một phép toán đồ thị. **Ta không cần phát minh;
   ta cần nhận ra.**
2. Độ khó **thuộc vị trí, không phải số**: cùng linh lực, cùng cảnh giới, hỏng ở node khác
   nhau tùy đường đi tới. **Không có con số nào để bơm.**
3. **火候 là một bộ chọn động từ** — đúng hình dạng của một lượt của agent.
4. **Vệ sinh nguồn có sẵn trong văn bản**: số đếm hô hào (216/36/180, 144/24/120, 60,
   闰余24, 合计384息) được truyền theo quy ước, và chú giải cổ **phủ nhận chúng là nghĩa
   đen** — 「至于三十六、二十四等说，均是设词」 và 「十二时与十二卦均属虚比」.
   Món quà hiếm: **một nguồn chính bảo bạn đừng trích số của chính nó.** Lấy tên giai đoạn,
   bỏ số đếm — và không ai có thể buộc tội vượt số.

### 经脉 / 穴位 — đã ship, có thứ tự, và **đảo chiều được**

- **诛神 (2011)**: mười hai kinh chính, mỗi kinh có huyệt tên, **phải mở đúng thứ tự và
  không chạy ngược**, vật phẩm mở khóa chỉ lấy từ elite trong dungeon
- **`烟雨江湖`**: 经脉 **可以顺通，也可以逆通**, và **逆元丹 lật chiều một kinh mạch đã mở**
- **新蓬莱 / 剑侠奇缘**: 奇经八脉, mỗi kinh 24 điểm, có thứ tự trong kinh, tự do giữa các
  kinh; 剑侠奇缘 thêm **小周天 (8 kinh) → 大周天 (có kiểm)**, tức **hai vòng**, vòng hai
  mở từ tiến độ vòng một
- **Pity trên một đồ thị**: 冲穴 thất bại thì **cộng cứng 5 bước tiến độ**; tại trần thì tính
  là đã mở. **Thành và bại đều đẩy.**
- Bẫy cộng dồn **đã nằm trong văn bản chính thức**: cộng phần trăm trên chỉ số của chính
  mình, và hướng dẫn khuyên trì hoãn điểm cuối

⇒ Một hệ thống thân thể **có thứ tự, đảo chiều được, có pity công khai, có một điểm ba
lối nơi lối sai là chết, và không có con số nào trên nó.**

### 洪荒 — một nhánh phụ với mô hình hai tài nguyên

- **气运 và 功德 là hai đường tích lũy riêng, chủ sở hữu khác nhau.** 气运 là tính liên tục
  của **教派/种族**; 功德 là chìa khoá đột phá của **cá nhân**
- **功德 phải TIÊU hoặc bạn rơi**: 「功德圣人…需要不断维护天地秩序，履行相应的职责，
  **否则可能跌落圣位**」 — quyền lực là hệ quả của **một nghĩa vụ còn tồn đọng**. Một
  **khoản nợ suy giảm, kiểm tra bằng máy, agent đọc được**. Không chỗ nào trong bản tổng
  hợp của tôi có khái niệm nợ
- **Phân phối được bởi bất kỳ ai có nó** — tài nguyên chuyển nhượng được, đơn vị có, cho
  không — **một tiền tệ không có thị trường và không mặc cả**
- **法宝 = quyền năng, không phải chỉ số**: 落宝金钱 = quyền tước đoạt, 穿心锁 = quyền giam,
  乾坤鼎 = quyền tạo hóa, 灭世大磨 = quyền chấm dứt
- **量劫 (bảng cố định) vs 杀劫 (nợ cá nhân)**: hai đồng hồ, một cái công khai một cái riêng

Nguồn phản chứng cùng trang, chất lượng nguyên văn, sweep không dùng: **混沌钟 không phải
từ 封神演义** (là 轩辕剑 của 大宇公司); **盘古化三清 là sáng tác của 《佛本是道》**;
**山海经 không có 十二祖巫**; **阐教十二金仙 là 港漫**; và **封神演义 không có thang phẩm
pháp bảo** — xác nhận điểm 天地玄黄 duy nhất còn sống của bản tổng hợp.

### 契约 / 道誓 — thang cưỡng chế bốn bậc, và thể loại nói nó thủng

`长生修仙，从熟能生巧开始` chương 424 cho cả thang:

| Bậc | Hình thức | Hậu quả khi phản bội |
|---|---|---|
| **法契** | chủ yếu cho thương mại, trên da/thẻ/tre/gỗ/trúc/giấy | cưỡng chế yếu nhất — 「有不少破解或者取巧的方式规避」, 「**低阶法契可能被高阶修士强行破除**」 |
| **道誓** | không vật thể; thề cả 前途 lẫn 性命 | nổ **ở lần đột phá kế tiếp**, gây 道心裂痕 khiến đường 「异常坎坷，难以精进，甚至道基崩溃」 — **hình phạt là biến dạng vĩnh viễn tiến trình của chính bạn** |
| **心魔血契** | niêm phong máu | sinh **心魔 nhắm vào điểm yếu cụ thể** của người phạm tội; bản nâng cao **chạm tới hậu duệ** |
| **天道誓言** | cao nhất | 天罚 / 业火 / 气运衰败 |

**Câu mang tải, và nó chống lại thiết kế:** 「法契並不是万能的…所以修仙界依然十分看重
修士的**信誉声望**」.

⇒ **Hợp đồng là một điều chỉnh xác suất, không phải bảo đảm.** Phối hợp dựa trên hợp đồng
đơn thuần là một ván cược.

**Hazard agent mà bản tổng hợp bỏ:** hình phạm của 心魔血契 **là một bài đọc hiểu văn bản
tự do theo cấu trúc** (nó nhắm vào điểm yếu của bạn, hệ thống buộc phải đọc). Một trường
hợp nữa của cái trách nhiệm free-text mà nó đã gọi tên một lần rồi không tổng quát hoá.

### 传讯/通讯 — thất bại trong im lặng

Ba mô hình đã ship:

- **千里传音螺** (một 符宝): một 重 chứa **3** 神魂刻印; 三重 chứa **27**. **Thang ô nhân
  đôi**, và sức chứa là một tập quyền, không phải một chỉ số
- **万里传音玉符**: tối đa **10** liên hệ, cần đóng dấu hai chiều
- **传音符**: 母符/子符, tầm gốc **三四十丈**, **mở rộng cả tông môn nhờ cưỡi 护门大阵**. Nếu
  母符 nằm ngoài tông môn, 子符 tìm **một đến hai canh giờ** rồi 「**自动消失，就像已经
  读过了一般**」

**Điều đó là ví dụ giáo dục về chính luật của repo.** Thể loại có sẵn ví dụ về một cơ chế
**không thể báo đỏ**: thất bại giống hệt thành công, không lỗi, không bounce, không đổi
state. Bất kỳ tầng phối hợp nào dựng trên message mà thiếu **biên nhận giao hàng** thừa hưởng
đúng cái thất bại đó. Bản tổng hợp **chưa cân nhắc message lần nào**.

Và khung đúng: 传音符 descends từ **兽角号令** của 共工/祝融 — **công cụ ra lệnh, không phải
điện thoại**. Agent không trò chuyện; chúng phát lệnh vào một hàng đợi.

### 任务榜 / 悬赏板 — bộ phân phối chống mặc cả, ở đúng quy mô

**凡人修真 (4399) 天仙任务系统** (chính thức):

- **任务书 chế tạo được**, nấu từ 阵法残卷/技能书, có giá trị tiến độ, bốn bậc:
  **真仙 5 / 天仙 50 / 玄仙 150 / 金仙 300**, trần 300, sách dở mang sang
- **发布:** 99 cấp+, tiêu một 任务书, **5/ngày**, **người đăng được trả khi nhiệm vụ được
  NHẬN** — không phải khi hoàn thành
- **接取:** **5/ngày**, **không nhận được nhiệm vụ của chính mình**, **bỏ dở không hoàn
  lượt thử**
- Ba loại: 打怪 / **运镖 — nhiệm vụ giao đến cho một agent khác** / 完成三界任务
- **机缘值 → 机缘等级 → 机缘封号 → chiêu tinh bạn 散修**

**Đó là toàn bộ cái thiết kế trong một hệ thống.** Bảng công khai, giới hạn tần suất,
kiểm tra bằng máy. **Tiền chạy khi hành động của chính agent đáp một vị từ, do hệ thống
đánh giá, không có cuộc trò chuyện nào.**

Hai cơ chế bảng nữa (`圣魔之血`, chính thức): **天之徽记 là vé vào cổng vật lý** — 5/ngày
từ NPC, nhiệm vụ tím **trả lại một vé**. **Bảng tự trả chi phí vào cửa ở bậc trên cùng.**
Và bảng **làm mới khi hoàn thành, theo từng người chơi** — nguồn việc là hàm của thông
lượng của đàn, **không có vòi NPC nào**. Một kinh tế tự điều tiết.

**Phải đưa vào danger list:** một nhiệm vụ `圣魔之血` đòi **hai người chơi, hai giới tính
khác nhau, đã kết bạn lẫn nhau** — co-op bị khoá bởi **tiền trạng quan hệ xã hội**. Bản tổng
hợp cấm mặc cả tự do và gọi 心魔 lockout của 诛仙, nhưng **quan hệ-khoá cơ phối hợp phổ biến
hơn nhiều và hỏng với agent nhiều hơn nhiều**.

Và một nguyên thủy tranh chấp mà bản tổng hợp không có: nhiệm vụ 魔树 **gieo một hạt phải
chạm cứ 2 phút, mỗi giai đoạn chỉ sống 3 phút nếu không ai chăm, và lúc kết quả thì ai
cũng cướp được**. **Công việc có đồng hồ, bỏ mặc, lộ ra toàn thế giới, và bị cướp giữa
chừng.** Không mặc cả, không tin, không scalar — tranh chấp thuần trên một đồng hồ công khai.

### 职业分工 — thể loại đã có câu trả lời cho bài khó nhất của tôi

`打工修仙记` (chính thức): **副职业 = 炼丹 / 炼器 / 布阵 / 制符 / 烹饪**, mỗi cái 9 phẩm,
**khóa chéo tường minh** — 烹饪 **tiêu** 制符 cùng phẩm; 炼er là **tiền đề cho tỉ lệ thành
công của mọi phụ nghề khác**; 炼丹 lấy nguyên liệu từ **灵田 của chính bạn**. Và **体质
可以同时存在多个，但是只能生效一个**; chỉ có được từ **秘境宝库100积分**.

`极光世界` (chính thức): **丹修 / 术修 / 剑修 / 巫修**, mỗi cái có danh hiệu thợ
(丹士/方士/侠士/巫士), và câu quyết định:

> 「**丹士并不追求法力上的强大，因此永远不会有天劫之忧**」
> 「**丹士们可以长生不老**」

⇒ **Tử thôn là thuộc tính của một con đường, không phải ngưỡng phải vượt.** Một 丹修 không
bao giờ gặp. Đây là cách giải **không-scalar** đã **ship, chính thức**, cho đúng câu hỏi mà
bản tổng hợp khẳng định *"the genre has most consistently got this wrong"*.

`诛仙2` (chính thức): 12 nghề nghiệp; 道无为学府 **不以提升战力为导向**; 仙枢师 tùy biến 法宝
theo **资质** của người mang.

`修仙家族模拟器` 的百艺: 「炼器，炼丹，炼符，**傀儡**，培育灵兽，阵法，种植，**采矿**」.
**傀儡 (puppets) và 采矿 xuất hiện ở đâu cả trong bản tổng hợp.** Puppets là **đơn vị tự
trị bạn chỉ huy thay vì thương lượng** — có lẽ là vật thể **hợp agent nhất** trong thể loại,
và hoàn toàn chưa ai quét.

## 1.13 ĐẢO — Điều bản tổng hợp hỏi mà không ai hỏi

> **Khi một agent chết, nó còn sở hữu cái gì?**

Trong một thế giới nhiều agent bền vững, **death handler chính là phễu cân bằng vòi phun**.
Và **không ràng buộc thiết kế nào trong tài liệu nhắc tới nó.** Đây là lỗ hổng đơn lớn nhất.

Hai câu trả lời tốt hơn, đều chưa ai quét: `修仙家族模拟器` 的魂莲台 — mỗi đệ tử hồi sinh
**một lần**, từ **1岁炼气一层**, **không cảnh giới, không kỹ thuật, không trang bị, không
hành trang**, với **xem trước xác định** (20% → 100%). Và **老祖转世 có độ trễ quay lại
ngẫu nhiên 30–100 năm** — bạn không hồi sinh, bạn hồi sinh **vào một ngày tương lai ngẫu nhiên**.

## 1.14 VỠ — Ba phát biểu tự tin hơn bằng chứng

1. **"Cơ chế duy nhất trong corpus thỏa mọi ràng buộc LLM cùng lúc"** (cửa sổ yếu 5 năm /
   5 ngày). Bản tổng hợp biết nó dựa trên một chương của một tiểu thuyết — nó nói vậy
   trong danh sách chưa giải quyết. Không sai khi để ở đó. **Sai khi nó là slot thiết kế
   hạng nhất kèm bài luận "vì sao không ai làm".** Hoặc tìm tác phẩm thứ hai và thứ ba,
   hoặc hạ xuống.
2. **"Thể loại nhất quán sai chuyện tử thôn"** — `了不起的修仙模拟器` ship một tử thôn
   **phán bằng karma và địa hình, qua ba con đường, với công thức bậc được công bố**. Một
   phản ví dụ không làm *"most consistently"* thành sai, nhưng làm câu **không đứng được
   khi viết**.
3. **Các trích dẫn LLM** — mục 1.4.

---

# ĐỢT 2 — CRITIC

> *"Phần lớn nó sống sót. Bốn thứ thì không. Và lỗ hổng lớn nhất là cái mà khuyến nghị
> chính của tài liệu phụ thuộc vào."*

## 2.1 VỠ — Toàn bộ cái giá của khuyến nghị chính nằm trên hệ thống không ai quét

Câu một dòng của bản tổng hợp: **một cảnh giới lớn nên mua QUYỀN, không phải một số lớn
hơn**. Mục openDesignSpace thừa nhận hoá đơn: *"if nothing scales, encounters must scale,
and the encounter table becomes the whole game."*

**Bảng encounter không có trong tài liệu.** Không mục itemTree nào về combat, enemy hay
encounter. **statModel 20 mục chứa không một chỉ số chiến đấu** — không công, không phòng thủ,
không chí mạng, không né, không bể chỉ số hồi phục, không hồi chiêu. Đợt này nêu "combat" và
"enemies" là trong phạm vi. **Chúng không được quét.**

⇒ Tài liệu đưa ra một phát minh mà tính khả thi của nó **hoàn toàn nằm trên một hệ thống nó
không có bằng chứng nào** — và không nhận ra đó là vấn đề. **Đó là phát hiện. Phần còn lại là
phụ.**

## 2.2 BẮC — Chiến đấu vắng mặt, và thể loại **đã giải xong** ràng buộc của dự án trong đó

Bốn cấu trúc lượt đã ship, **không cái nào xuất hiện trong bản tổng hợp**:

| Nguồn | Cấu trúc | Vì sao quan trọng |
|---|---|---|
| **指尖修仙 (2017)** | 回合制, **trần 60 lượt**, phán đoán: 「60回合以内击杀则胜利，否则失败」 và 「60回合后如果没有死亡方，则**防守者胜利**，挑战者失败」 | Không có giây. **Ha mòn về phía bên phòng thủ**, không về phía mạnh hơn |
| **无极仙途 (2024)** | 「共30回合，30回合内没打死对面算**进攻方输**」 | Cùng hình dạng, trần khác |
| **一起来修仙** | Tốc độ quyết định thứ tự; **当一方速度领先约10%时必定先手**; buff **đếm theo lượt, không theo hành động**, bất kể ai hành động; **宠物 luôn ưu tiên trước lượt người chơi** — tốc độ pet là chỉ số chết vì luật đã cắt nó | |
| **剑侠情缘95 (2001)** | Bậc trật tự là thuộc tính **cả đội**: `团队总加权身法 = Σ(身法_i × rnd(0.9,1.1) × 行动系数)`, 行动系数 合击 10 / 防御 5 / 治疗 3 / 加速 3 / 逃跑 2 / 攻击 1, và **mọi hành động của địch đều có 行动系数 = 1** | **5 nhân vật yếu thắng 1 nhân vật mạnh** trên bậc trật tự, và **nhân vật không đọc được bậc trật tự của chính mình** từ sức mạnh của chính mình |

Bằng chứng về đơn vị lượt của toàn bộ bản tổng hợp là **một con số** (100 道力 mỗi trận của
鬼谷八荒), nằm chôn trong một đoạn thiết kế chứ không phải trong chất nền.

⇒ **Câu trả lời của thể loại cho "không có giây trong kinh tế" không phải một loại tiền — nó
là một trần lượt cứng, được bảo vệ, và bên phòng thủ thắng khi hòa.** Nó đã ship hai mươi
năm. Đó là một bài toán **lập lịch** — đúng loại bài agent giỏi.

**Cơ chế đơn vị lượng tốt nhất bị bỏ trong toàn bộ chất nền: khối lượt.** Chế độ thủ công của
`指尖修仙`: **每6个回合为一轮**, và màn xếp thứ tự xuất hiện **đầu trận và cuối mỗi khối 6
lượt**. Ngân sách lập kế hoạch **hữu hạn, đơn vị lượt, có điểm quyết định định kỳ** — và có
**giới hạn đồng hồ chờ sau đó game tự chọn**: một hazard phản xạ có **mặc định an toàn được
thiết kế sẵn**, đã ship.

**Và hazard micromanagement bản tổng hợp nhắm sai mục tiêu.** Ràng buộc "no micromanagement
surface" được dẫn chứng bằng bộ tạo mặt 48 xương của NetEase — đó là **một bài báo game về
UI console**. Trường hợp đúng đề tài là `无极仙途`: **6 人物招式 (trong 100+) + 5 灵兽招式
(trong 100+) + 10 本命神通 + 2 天赋 + 本命飞剑 + 5 法则 ≈ 28 ô cấu hình tay, phải điều chỉnh
lại theo từng đối thủ**, với tương tác thứ tự ra lệnh và hồi chiêu. Một game tu tiên năm
2024, đúng thể loại, và về mặt cấu trúc **tệ hơn nhiều**.

## 2.3 BẮC — Cái scalar 境界 được cài vào **turn loop**, và không ai viết ra

- `修个什么仙`: **出手顺序 so 境界＞灵巧 trước**, chỉ khi bằng mới xét 灵巧
- `修仙家族模拟器2`: **神识 ảnh hưởng 战斗出手顺序**

⇒ Trong một lớp game tu tiên RPG đã ship đáng kể, **境界 là một scalar sức mạnh chiến đấu**
— đúng thứ luật repo cấm — **được cài qua thứ tự lượt chứ không qua nhân sát thương**.

Bản tổng hợp xếp 境界 là `escapesScalar:false` với lý do *"境界压制 IS the scalar wearing a
costume"* rồi **không đi theo hệ quả**: thể loại không chỉ chấp nhận nó, nó **cắm cái thang
vào vòng lượt** — và `剑侠情缘` cho thấy nó **đã bị gỡ có chủ đ giữa 2001 và 2024**.

**Câu xu hướng đó là câu có giá trị nhất trong toàn bộ đợt 2, và nó không nằm trong bản tổng
hợp.**

Cùng game đó còn ship **以静制动: 我方越慢，伤害加成倍率越高** — một chỉ số chiến đấu
**không đơn điệu**, đã ship, không ai nhắc.

## 2.4 ĐẢO — `乘区` và công thức sát thương: hệ thống lớn nhất bị bỏ, và nó **bác bỏ** mục "bounded properties"

Bản tổng hợp nói bounded = **clamp** (80% / 25% / 50% / 95%). **Sai.** Đã ship:

- **铸仙之境** — tám 乘区 có tên, công thức đầy đủ, và
  **`暴击率 = log₂(暴击等级/抗暴等级)/4`**: bị chặn **ở cả hai đầu bằng cấu trúc** — ≤1×
  không bao giờ chí mạng, 2× = 25%, 4× = 50%, 8× = 75%, 16× = chắc chắn. **Một hàm log là
  câu trả lời cho lạm phát số tốt hơn hẳn một cái trần**, và bản tổng hợp chưa từng thấy một
  chỉ số **bị chặn bằng cấu trúc**.
- **我的勇者** — chuyển đổi chí mạng là **ba đoạn**: `<200 → 值/400`; `200–500 → (值×17)/6000
  − 值²/600000` (**bậc hai**); `≥500 → 值/500`; rồi ×(1+%) − kháng, trần 100%, và **phần
  tràn bị vứt** (「溢出暴击率的部分没用的哦」). **Hình dạng của đường cong là thiết kế.**
- **仙境传说RO** — công thức khắc phục hệ sinh: `元素结算 = 1 − x − 0.3(1 − sin(xπ/2)) − 0.2`,
  với các điểm bão hoà đã công bố (58,9% khắc hệ → giảm tối đa 85%; 83,6% chủng tộc; 69,8%
  vật lý; 94,4% phép thuật). Và **tại x = 0 hệ số là 0,5 chứ không phải 1,0** — một trận
  hoàn toàn trung tính đánh **một nửa sát thương**. Phòng thủ là `1/(1 + 6·def/atk)` và game
  **lấy công thức nào có lợi cho kẻ tấn công**
- **修仙家族模拟器2** (bài trên diện độ nhà phát triển, 2025) — công bố bảng chuyển đổi chỉ
  số **và chỗ chế độ đảo chiều**: 攻击 1% ≥ 伤害 1%; 穿透 1% = 0.25% 攻击; 增伤 1% = 0.75%
  攻击; 暴率 1% = 增伤 1.5%; 常驻防御 ≈ 攻击/4. Rồi: **攻击 ≥125% thì 增伤 lợi hơn attack;
  ≥58% thì 暴击率 lợi hơn; ≥80% + 暴击率 65% thì 暴伤 lợi hơn 暴伤**. Đó là **điểm uốn định
  danh build được công bố**. Ngoài ra: 伤害浮动 ±10%, và **增益不锁面板** — buff đi thẳng
  vào sát thương cuối, **bảng chỉ số nói dối có chủ đích**

**Cái cuối là câu trả lời thật cho bài toán chống scalar, và bản tổng hợp bỏ lỡ: một chỉ
số mà bảng hiện ra không phải chỉ số đánh nhau.** Với người chơi là LLM, đây **hoặc** là thuộc
tính đáng giá nhất bạn có thể ship, **hoặc** là cái bẫy chết người về khả năng đọc. Tài liệu
không có lập trường nào.

## 2.5 BẮC — Năm claim sai hoặc ngược, kèm nguồn

**1. "梦幻西游 một mình" về cấu trúc khắc phục — sai, và ví dụ thật tốt hơn.** Wiki chính
thức NetEase 大话西游2 công bố
`强克 = (1+己方强克+对方被克属性) × [1 + (己方克对方×对方被克 − 己方被克×对方克己方)] × 40%`,
với điểm giao **tổng khắc 178** nơi **phân tán thắng trục đơn**, và quy tắc rõ ràng **五行相克
một chiều**: bị khắc không tốn giảm nào. ACS công bố `风水值 = P_目标 + 2·P_生目标 −
2·P_克目标`. RO công bố đường cong sin. **Ba hệ ngũ hành đã ship với công thức đã công bố,
không scalar, hình dạng vector.** Bản tổng hợp xếp mạnh nhất vào ONE_GAME.

**2. "Không game tu tiên nào có kết cục chiến đấu không chết thật" — sai ngay trong corpus của
nó.** `修仙家族模拟器2` 的**心魔劫** có **hai** cách kết thúc: giết nhanh, **hoặc sống sót
năm phút** — và chứa **bản sao nhân vật phái sinh từ chỉ số của chính bạn** (「心魔有个你自己
复制体，你越强他越强…他的面板属性默认为你的几倍」), nơi lượt chơi tối ưu là **bỏ hết kỹ năng công
kích**. **雷劫** là một trận sống sót thời gian thực năm phút **không có tùy chọn giết**.
Bản tổng hợp trích game này ở chín field và **không một lần** nhắc hai điều đó.

**3. "Thất bại không phá hủy là điều live-service không dám làm" — 雷劫 phủ nhận.** 雷劫
**hủy vĩnh viễn trang bị**: 耐久上限 về 0, 「**装备破碎无法修复**」, và hướng dẫn bảo mang **bộ
dự phòng** vì bộ chính có thể không sống sót. Danger list của bản tổng hợp dành một mục cho
hazard phá hủy, dùng `诛仙` 佩章 làm bằng chứng thể loại thủ thủ, và **không kiểm tra chính
game trụ cột của nó**.

**4. 寿元 như đồng hồ lượt chạy — game cung cấp công tắc TẮT nó.** `修仙家族模拟器2` có hai
chế độ chọn lúc tạo nhân vật: **修仙模式** (chết chỉ tốn 元气, tu luyện đình trệ) và **真仙模式**
(chết, 修为归零, chơi lại). Một công tắc người chơi về việc đồng hồ lượt chạy có tồn tại hay
không, **thú vị hơn chính cái đồng hồ**.

**5. "Đúng một game đã thử" — tần suất nền không đứng được.** Mọi "đúng một" trong tài liệu
nghĩa là *"đúng một trong ~15 game mà ai đó tìm thấy wiki"*. Cái duy nhất được kiểm toán
(`ACS 品阶`) **đã sai và sinh ba artefact dẻ xuống** — tài liệu tự nói vậy rồi không tổng quát
hoá sang **mười một negative chưa kiểm toán**, và critic đã **đảo ngược năm cái**.

## 2.6 ĐẢO — "Đấu tranh không đều" của 梦幻西游 không đều, và đó mới là điểm thú vị

Tài liệu khẳng định *"regular only over NINE vertices"* rồi **ngay câu sau** liệt kê
out-degree **3,4,3,4,3,4,3,4**. Một giải đấu đều trên 9 đỉnh có mọi out-degree bằng nhau. Xen
kẽ 3/4 là **giải đấu không đều** — nghĩa là **không mảng nào đứng ngang nhau**.

Tài liệu **phát biểu tính chất rồi bác bỏ nó trong cùng một câu**, rồi dựng kết luận "nó luôn
trả lời ai mạnh hơn" lên trên đó.

## 2.7 ĐẢO — `双重方案` sống sót, và chi tiết sống sót **đảo ngược** một kết luận

Nó là first-party (tài khoản nhà phát triển TapTap). Nhưng tài liệu gọi hai nhánh là
"equal-status". **Không phải.** Nhánh roll là nhánh **giảm tải cho người chơi** (「为了降低
大家的负担，我们可以直接跳过玩法」), và dưới nhánh đó **肉身关不展示啦** — xác suất được công bố
bị **ẩn đi ở một trong ba cổng**.

⇒ **Mức độ tiết lộ thông tin phụ thuộc nhánh, theo lựa chọn của designer.** Đó là một cơ chế
hay hơn nhiều so với cách đóng khung "ngang hàng", và cách đóng khung của tài liệu làm mất
nó.

## 2.8 BẮC — Câu hỏi thực nghiệm nặng nhất **đã có đáp án**, và nó cắt ngang lập luận của bản tổng hợp

Bản tổng hợp gọi *"LLM có so sánh vector chỉ số đáng tin như so sánh số nguyên không"* là
**"the load-bearing empirical question under the whole no-scalar rule"**. **Nó không chưa giải.**

- **LISTEN (arXiv 2510.25799, IJCAI-ECAI 2026)** đã chạy đúng phép thử đó: xếp hạng của người
  làm ground truth, đối chiếu bộ chấm z-score tất định, LLM xếp hạng một lượt, và LLM so
  sánh theo khối. Kết quả: **bộ tổng hợp LLM bằng hoặc vượt baseline tiện ích tuyến tính**,
  và phần cải thiện của nó so với "xếp hạng LLM thô toàn bộ danh sách" đến từ **tách theo kích
  thước ngữ cảnh, không phải theo số thuộc tính**.
- **DecompR (arXiv 2605.26878)** là phát hiện quan trọng với ta và **không có trong tài liệu**:
  *"Holistic LLM judges conflate utility estimation and utility aggregation, yielding unstable
  implicit weights… these weight-induced shifts also increase with stakeholder count."* Yêu
  cầu LLM xếp hạng theo nhiều tiêu chí cạnh tranh sinh ra **trôi trọng số**, và **độ trôi tăng
  theo số tiêu chí**. Cách sửa là **cố định trọng số trước khi chấm**, không để mô hình tự chọn
  ngầm.

**Hai hệ quả, và cái thứ hai đáng giá nhất:**

1. **Luật cấm scalar là một tuyên bố về HỆ THỐNG, không phải về NHẬN THỨC.** Luật trong repo
   nói: *một khi con số tồn tại, mọi hệ khác âm thầm trở thành hàm của nó* — đó là nói về **nhà
   thiết kế** dựng gì. Agent có gộp được vector lúc chơi hay không là một câu khác, và tài
   liệu nói **agent làm được**. **Bản tổng hợp bảo vệ một lập luận khác với lý do của nó.**
2. **Bảng xếp hạng mà bản tổng hợp đề xuất là ca tệ nhất đã công bố.** *"A leaderboard whose
   entry is a SET rather than a number, a reward curve that pays for the set's composition
   rather than its total"* — chính xác là ca nhiều bên tiêu chí mà DecompR nói sẽ trôi. Nó
   được đề xuất **mà không kiểm tra LLM có xếp hạng nó ổn định hay không**. **Không ổn định,
   trừ khi trọng số được công bố và cố định** — cùng cách sửa mà các bài 乘区 dùng.

## 2.9 BẮC — Một meta-scalar mà game trụ cột của tài liệu ship, không ai nhắc

**功德** (điểm tài năng) vắng mặt khỏi toàn bộ tài liệu. 局外功德 **chỉ kiếm được khi 转生**,
tính theo cảnh giới, và **nhân đôi mỗi cảnh giới lớn**: 练气 +1/层 → 筑基 +2 → 金丹 +4. Nó
mua **灵根** (五灵 0 / 伪 2 / 三 5 / 双 10 / 单 20 / 天 80) và mọi tài năng.

**Hai vòng lặp nhân đôi lồng nhau xuyên nhiều thế hệ.**

Phán đoán mạnh nhất của tài liệu là 寿元 như một đồng hồ lượt chạy không-scalar, lấy từ một
game mà **tiến trình ngoài trò chơi là một ngân sách điểm nhân đôi mua phân bố thiên tài
cố hữu của nhân vật**. **Không ai hoà giải hai điều đó.**

## 2.10 BẮC — Thiếu nguồn bản đầu, và mẫu chọn có thiên lệch

> **Không một nguồn bản đầu nào trong toàn bộ tài liệu**, ngoài hai bài TapTap mà critic tìm
> ra. Không dev blog, không GDC talk, không 设计师访谈, không patch note, không ảnh tooltip
> trong game.

Mỗi claim về **"vì sao chưa ai làm"** — *đầu ra trung tâm của tài liệu* — đều lấy từ wiki và
trang hướng dẫn. Với một tài liệu có luận điểm *"chưa ai làm, và đây là vì say"*, đó là **sai
lớp bằng chứng cho toàn bộ câu hỏi**.

Và: `修仙家族模拟器2` chiếm **~40% bằng chứng chịu tải**, và là **MMO mobile 2D, ba người,
ít ngân sách** (chính nhà phát triển: 「我们目前还是几个人的小团队开发，并且没有太多资金，
因此次全游戏只能是2D画面」), được sweep vào **vì nó có wiki**. **Nó là game có tài liệu tốt
nhất đúng vì lý do nó ít đại diện nhất.**

Tương tự: `觅长生` 的修为 rate **không có đơn vị thời gian và sai số nội bộ 171×** — mục
chưa giải quyết của chính tài liệu — rồi tài liệu **dẫn game đó cho claim chính** và còn
sáu lần nữa, kể cả bảng nguyên liệu chế tạo "tốt nhất corpus" mà cửa sổ chế tạo của nó tính
bằng **ngày**. `鬼谷八荒` mang bốn claim chịu tải và **đã bị đọc sai một lần rồi** (lỗi thang
30 bậc). `太吾绘卷` được mô hình hoá từ hướng dẫn early-access, **bản 正式版 chưa từng được
đọc**.

**Và `Nature 2025` được dùng bốn lần như một ràng buộc cứng**, nhưng nó nói về Trò chơi Nhân
tài lặp lại trong thí nghiệm có kiểm soát; **nhân nó lên một thế giới 50 agent bền vững là một
bước nhảy loại** mà tài liệu không gắn cờ.

## 2.11 ĐẢO — Một "đúng không" nữa, lần này mang tính quyết định

`灵根` trong `觅长生` **không phải scalar** — nó là **vector trọng số**: 伪灵根 = 20% mỗi hệ;
天灵根-金 = 33,33% Kim và 16,67% mỗi hệ khác. Bản tổng hợp ghi nó là `isScalarRisk: false` vì
chỉ "a weight VECTOR". Đúng — nhưng rủi ro scalar **không nằm ở cách nó vẽ, mà ở cái nhân
tốc độ tu luyện gắn vào đỉnh nó**: **天灵根 = 2–3× tốc độ tu luyện**, và nguồn thống nhất cho
thấy đó là một hằng số nhân tuyến tính trên chính cái vector.

Còn `道心` mới là cái thoát thật, và nó **đã ship**: **`道心` reset về 0 mỗi lần thăng cảnh
giới**, được nâng bằng sự kiện trong cảnh giới, và ở 100 thì các cổng 神识关 **tự động qua
hoàn toàn**. Không bao giờ qua được nếu bạn không có điểm; **luôn qua được nếu bạn đã xây
đủ trong cảnh giới**. Một điều kiện **không so sánh được giữa hai người**, bởi nó không sống
sang cảnh giới sau.

## 2.12 ĐẢO — Percentile stacking chưa được gọi tên

`剑侠奇缘`: mỗi điểm kinh mạch hoàn thành cho phần trăm, và hướng dẫn khuyên **trì hoãn
điểm cuối**. Một chỉ số là phần trăm của phần trăm là cách dựng lại scalar từ bốn cái nhỏ.
Tài liệu có luật này cho 寿元 và 战力, **không có cho việc cộng dồn vật phẩm/kinh mạch**.

## 2.13 THỪA — Đánh giá bằng chứng sai loại

`资` trộn ba đường cơ sở trong một ghi chú. **Trường `isScalarRisk` không bảo vệ được như
đã gán**: 悟道点 đánh dấu `false` vì quyết định nó tài trợ là "topological rather than
volumetric" — cùng lập luận sẽ xóa 战力, trên một tổng đi từ 83 lên 98–108.

**Bốn mục itemTree mang nhãn lai** ("GENRE_CANON noun, ONE_GAME every implementation" ×3)
trong khi brief đòi **đúng một** nhãn. **Mọi nhãn lai nằm trên một mục mà `ourOpportunity`
của nó là "chưa ai làm".** Nếu danh từ là canon và mọi hiện thực là của một studio, nhãn
trung thực là ONE_GAME và **claim mới chết cùng nó**.

**Không game nào ngoài Trung Quốc xuất hiện** trong itemTree, levelModel hay statModel — dù
tài liệu tự gọi tên WoW và Dark Souls trong mục chưa giải quyết và thừa nhận quét nông. Với
một brief "game gốc" mà điểm khác biệt duy nhất là thiết kế chống scalar, **thân thể hệ
thống RPG đã ship được năm mươi năm mà không có power score chính là chỗ nên đọc** — và nó
không được đọc.

---

# ĐỢT 3 — CRITIC

> **Đợt 3 đã bị một critic đánh giá là đóng ĐÚNG HAI LỖ HỔNG MÀ NÓ ĐƯỢC GIAO.**
> Một nửa, với một lý do mà nó tự thừa nhận.

## 3.0 BẮC — Bằng chứng của đợt 3 không có trong repo, và không ai tái tạo được

Critic mở `docs/dao-lu/.research/2026-09-30/` và tìm thấy **hai** tệp của hai đợt trước.
**Không có report domain nào, không có skeptic nào, không có audit nào.**

> **"Tổng hợp là một văn bản mồ côi tồn tại ở đâu đó ngoài kho."**

Và nghiêm trọng hơn: critic **không thể tái tạo** 3 trong 4 calibration case, **vì các phần bác
bỏ không nằm trong repo** — "không phải thất bại của tìm kiếm của tôi; đó là vấn đề bằng chứng
mồ côi, lặp lại trong đúng một mục mà toàn bộ giá trị của nó nằm ở chỗ được hiệu chuẩn."

Đây chính là `AGENTS.md` nói: *"A gate that cannot fail is worse than no gate."* Một tổng hợp mà
không mở được ra để kiểm thì không thể kiểm, và đợt sau sẽ coi nó là đã chốt.

**Đã sửa** (xem `OPEN-QUESTIONS.md` §7): `.research/2026-09-30/` nay có bốn tệp, và
`CALIBRATION-DISPROOFS.md` là đối chứng cho mọi audit negative sau này.

## 3.1 BẮC — Trích dẫn chính cho câu trả lời trung tâm sai một nửa

Đợt 3 viết: *"寻道大千's 真实伤害 (six named skills) **and 灵兽** ignore 防御 entirely **and
both skip 增伤/减伤**."*

Nguyên văn công thức:

```
灵兽技能伤害 = 最终攻击力 ×(1+鼓舞)×(1−压制)×(1+强灵−弱灵)×(我方实际增伤 − 目标实际减伤)×灵兽技能值
```

⇒ **灵兽 bỏ qua 防御, nhưng TIÊU 增伤/减伤.** Đơn vị bỏ qua `防御` **và** giữ 增伤/减伤 là
**精怪**: 「精怪的伤害无视目标防御力。受增减伤、破甲格挡属性影响。」

Đợt 3 **gộp ba hệ con khác nhau** (精怪 / 宠物 / 灵兽) vào **đúng một câu** mang câu trả lời của
thể loại cho `境界碾压`.

Và tệ hơn: biểu thức nền thật của game là

```
非暴击人物伤害 = (最终攻击力 − 目标最终防御力) × (1 + 我方实际增伤 − 目标实际减伤) × (1 + 鬼将值)
```

— **đúng là difference-of-aggregates**, mà chính `scalarEnforcement` #1 của đợt 3 gọi là
*"hình dạng phổ biến nhất và khó đọc nhất"*, **và nó đặt `寻道大千` lên đầu tiên**. Đợt 3 đề
xuất cơ chế bounded-difference của game đó mà **không nói rõ nó nằm bên trong biểu thức mà
chính đợt 3 kết án.** Với một thiết kế mới luận điểm là **hình dạng của biểu thức mới quan
trọng**, đó là nửa sai của đúng cái tên đó.

## 3.2 BẮC — Số của thiết bị trung tâm là content farm, và có dấu hiệu trộn

Đợt 3 đưa ra năm dải độ khó của `觅长生` như **"CÂU TRẢ LỜI"**, với số:
极简 (+5 lá bài/lượt, −50% sát thương), 简单 (+2, −20%), 困难 (+20% nhận, −20% phát),
极难 (+50% nhận, −50% phát).

**Nguồn duy nhất tìm được là 游民星空 — in lại NGUYÊN VĂN bởi 9game, 老友网 và TapTap**,
một nguồn content farm mặc bốn mũ, **cùng lỗi chính tả giống hệt**.

- **Hướng và chiều của 极难 và 极简: đúng.**
- **极简 "+5 lá bài/lượt": không có con số nào trong bất kỳ nguồn nào.** Nguồn nói "tăng hấp thụ
  linh khí", không định lượng.
- **Số của 简单 và 困难: không xuất hiện trong nguồn nào tôi tìm tới.**

Và có bằng chứng dương của việc trộn: **số lá bài thật trong `觅长生` là theo CẢNH GIỚI và theo
功法** — 「练气初始4卡…筑基5卡…金丹6卡…但是有功法会和你第一回合的卡数量相关，比如凌云决（初始多抽
1~3卡）」. Các con số `+1/+2/+3` mà đợt 3 gán cho dải độ khó **thuộc bảng cảnh giới và bảng
功法**.

⇒ Thiết bị **sống** — năm dải điều biến sát thương nhận/phát, đọc được trước khi cam kết,
**là thật và đúng hình dạng**. **Các con số gắn vào nó thì không.**

## 3.3 ĐẢO — "Không studio nào nói" là sai, và slot #4 là lỗ hổng tài liệu chứ không phải thiết kế

Đợt 3 viết: *"原神 multiplies 减防×无视防御; 崩坏 adds them. Two studios, opposite rules,
neither stated. That is a free, shippable transparency win nobody has taken."*

Quy tắc được nói **rõ, đối chiếu, và từ năm 2023**:

> 「在原神中，减防与无视防御**乘算**，相互稀释，而在星穹铁道中，减防与无视防御**加算**，相互反稀释」

Và luật riêng của 原神 nằm trên HoYoLAB: 「**穿防属性与怪物的最终防御力乘算**」.

⇒ Claim đúng phải hẹp lại: **không studio nào hiện quy tắc này TRONG GAME; nó chỉ tồn tại
trong wiki cộng đồng.** Và đó là **một thắng lợi tài liệu**, không phải một khoảng trống thiết
kế. Lý do "chưa ai lấy" của đợt 3 — *"kỹ thuật: quy tắc rơi ra từ thứ tự engine" — **sai** ở
cùng hướng với phần còn lại: quy tắc rẻ để nói và đã được biết, nên nó **không mới và không bị
chặn**.

**Một thiếu sót liên quan làm đổi khuyến nghị**: mô hình kháng của 星铁 chỉ an toàn vì
**không có quái nào trên 75% kháng và không có kháng âm**. Đợt 3 đưa nó ra như sao chép được mà
không kèm **điều kiện cho phép** đó. Chép công thức mà bỏ điều kiện là **ship một vách tại
75%**.

## 3.4 ĐẢO — Nhầm hai mức suy giảm

Đợt 3 viết: *"bản 50/30/10 đọc thứ hạng và bỏ qua độ lớn — thứ tự duy nhất; bản 8.0 là hàm
mũ không chặn."*

**Cả hai đều là thứ tự.** Cả hai là hàm của **chỉ số cảnh giới** và không gì khác. 50/30/10 là
thang ba bước **có chặn**; 0,5ⁿ là hình học **không chặn**; không cái nào đọc độ lớn. Đối lập
thật là **chặn/không chặn**, không phải "thứ tự/không".

Bằng chứng đều chính thức:

> 「相差一个大境界攻击，伤害直接减半，相差2个大境界，伤害只有30%，3个大境界伤害只有10%」
> 「攻击者每高一个大境界，就会自动忽视一半的对应效果…筑基期攻击，炼气期就只生效50%，紫府期则只生效25%」

## 3.5 BẮC — Công thức của `弈仙牌` đã bị sửa mà đợt 3 không ghi ngày

Đợt 3 xếp `弈仙牌` là **"chi phí máy thấp nhất… duy nhất được công bố trọn vẹn"**. "Công bố trọn
vẹn" thì đúng. **"Ổn định công bố" thì không.**

| | FAQ chính thức 2024-01-25 | FAQ chính thức 2026-06-09 |
|---|---|---|
| 命元, gap ≤ 20 | 轮次数 + **0** + 差/5 | 轮次数 + **1** + 差/5 |
| 命元, gap > 20 | 轮次数 + **4** + (差−20)/10 | 轮次数 + **5** + (差−20)/10 |

Slope, trần và điểm gấp khúc giữ nguyên. **Hằng số dịch.** Đợt 3 nêu chúng **không ngày** —
trong một tài liệu mà luật nêu là mọi con số phải mang đơn vị và mẫu số.

Và phán quyết "chi phí máy thấp nhất" bỏ sót điều mà wiki chính thức nói thẳng: **修为 ở đó là
MỘT con số làm BA việc** — nó đặt 先手, nó **chặn các bước cảnh giới** (9/21/36/55 修为 →
筑基/金丹/元婴/化神), và nó định cỡ bộ bài. **Đó đúng là chế độ thất bại của luật repo, trong
đúng cái tên mà đợt 3 dùng làm ví dụ sạch nhất.**

## 3.6 ĐẢO — Audit: 46% không trả lời, và cách nó tự kết luận không đứng

Đợt 3 gọi **6 INCONCLUSIVE trên 13** là "đảo ngược tri thức" và nói số sót **yếu hơn** số gục.

**Suy luận đó không có.** Tái tạo bốn positives đã biết chứng minh **tìm kiếm có khả năng tìm
thấy positives**, không phải một kết quả rỗng là bằng chứng yếu. Mệnh đề bảo vệ được là hẹp
hơn nhiều:

> *Một negative sống sót qua một lần tìm kiếm **mà lần tìm kiếm đó cũng tìm ra bốn cái
> biết-đúng** mạnh hơn một negative sống sót qua một lần tìm kiếm **không tìm ra gì**.*

Và cơ chế có **vòng tròn** mà đợt 3 không gọi tên: **tìm kiếm được chọn bởi chính các negative
nó đang kiểm tra.** Tìm được C1–C4 chứng minh audit đã nhìn vào nơi mục tiêu của nó nằm —
**không** chứng minh nó đã nhìn vào nơi một negative chưa liệt kê sẽ nằm.

**Một nhãn sai:** đợt 3 gắn nhãn **"first-party (studio blogs)"** cho `ACS 品阶浮动`. Trang bwiki
đó mang 「数据仅作参考」 ngay trên bảng mà công thức được đọc ra, và devlog của studio chỉ nói
định tính. **Đó là số học của hướng dẫn.** Nhãn sai **theo hướng ngược lại** với tự phê bình
gay gắt nhất của chính audit (*"tỉ lệ chính thức trung thực là khoảng một phần ba"*) — tức audit
**đánh giả mức độ khắc kỷ của chính mình**.

## 3.7 Những gì đợt 3 làm đúng mà các đợt trước không làm

Ba cái, và không cái nào nhỏ:

1. **Sửa tiền đề là thật và được thu hẹp đúng.** *"No damage multiplier"* thì sai; **"no
   **realm** multiplier"** thì đúng. `觅长生` **có** các vùng nhân (×1,25, ×1,18→×1,90 theo
   chồng, ×4 chí mạng, thanh toán tuần tự) và **không** có hệ số theo cảnh giới. Đó là một
   sửa chữa thật cho claim của đợt 2 trong `RPG-SUBSTRATE.md`.
2. **Đường vòng loại sát thương có tải và không chỉnh được**, và bằng chứng là **một mod năm
   2026 tồn tại chính là để THÊM 境界压制**. Một cộng đồng viết cái cơ chế mà studio không cân
   nhắc là đã đóng — đó là bằng chứng mạnh nhất có sẵn rằng thiết kế đã trả lời một câu hỏi mà
   studio tưởng đã xong.
3. **Câu trả lời ba thiết bị đúng về cấu trúc, và bất đối xứng phần thưởng là điều đáng sợ
   nhất.** *"Một trận đấu có thể không scalar; phần thưởng thì không, vì độ hiếm là một thứ tự"*
   là **câu nhọn nhất của cả chuỗi**, và không gì tôi tìm thấy mâu thuẫn với nó.

---

# Điều ba đợt nghiên cứu này dạy, viết lại thành luật

1. **"Đúng một" là tần suất mẫu, không phải tần suất thế giới.** Đã kiểm toán một negative,
   nó sai, và nó sinh ba artefact. Mười một cái còn lại **chưa kiểm chứng**.
2. **Nguồn bịa trong ngữ pháp đo lường hoàn hảo** là loại nguy hiểm nhất, vì nó lọt qua mọi
   kiểm tra hình thức. Bốn truy vấn rõ ràng nhất trả về bốn trang bịa.
3. **Một claim đúng xuất hiện một lần trong nước bẩn và một lần trong wiki thật** — và nếu
   trích cẩu thảo, nó trông đáng nghi. Báo cáo wiki, vứt nước bẩn, **ghi rõ cả hai**.
4. **Trích một diễn đàn và gọi nó là "official"** đã suýt giết hard constraint quan trọng nhất
   trong cả dự án.
5. **Dùng nguyên văn gốc làm bằng chứng phủ định, mà không mở nó ra đọc** — 封神演义 bị dùng
   sai ba lần và nó chứa sẵn cơ chế chống scalar mà ta cần nhất.
6. **Bằng chứng tập trung vào một game vì game đó có wiki** là chọn mẫu theo khả năng tài
   liệu hoá, không theo khả năng đại diện.
7. **Bản tổng hợp dễ bị viết lại theo đúng lỗi của nó.** Cả ba đợt đều tự sản sinh một
   tổng hợp trôi chỗ, rồi phải có một critic đọc ngược lại.
8. **Bằng chứng không nằm trong repo thì không kiểm được, và một audit chỉ có giá trị nếu đối
   chứng của nó nằm trong repo.** Đợt 3 không thể tái tạo 3 calibration case vì chúng nằm
   trong một văn bản mồ côi. `CALIBRATION-DISPROOFS.md` tồn tại để điều đó không tái diễn.

---

## Nguồn

Đợt 1: 19 domain, 40 agent, 6M subagent token.
Đợt 2: 18 domain, 36 agent, 5.2M subagent token.
Đợt 3: 16 domain + audit 13 negative, 33 agent, 5.5M subagent token.

Raw: `.research/2026-09-30/` — gồm `CALIBRATION-DISPROOFS.md`, đối chứng bắt buộc cho mọi
audit negative sau này.
Tổng hợp: `GENRE-CANON.md`, `RPG-SUBSTRATE.md`, `OPEN-QUESTIONS.md`.
