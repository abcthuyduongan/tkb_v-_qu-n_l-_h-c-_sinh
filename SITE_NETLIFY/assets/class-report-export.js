/* Local report downloads. The caller supplies data already authorized for the account. */
(function (root) {
  'use strict';
  const categories = { positive: 'Tích cực', concern: 'Cần cải thiện', health: 'Sức khỏe' };
  const attendanceLabels = { present: 'Có mặt', absent: 'Vắng', late: 'Muộn', excused: 'Có phép' };
  const reviewSource = row => row.source === 'system' ? 'Tổng hợp hệ thống' : 'Giáo viên đã xác nhận';
  const reviewStage = row => ({in_progress:'Đang trong tiết',final:'Đã kết thúc tiết',unknown:'Chưa xác định giờ kết thúc'}[row.stage] || '');
  const reviewTeacher = (row, session) => row.source === 'system' ? '' : row.teacher_name || session.teacher_name || '';
  const xml = value => String(value == null ? '' : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  // Keep free text as text, including when the exported workbook is copied into another spreadsheet.
  const safeCell = value => typeof value === 'string' && /^[\s\uFEFF]*[=+\-@]/.test(value) ? "'" + value : value;
  const number = value => value == null || value === '' ? '' : Number.isFinite(Number(value)) ? Number(value) : '';
  const confirmed = value => typeof value === 'boolean' ? value ? 'Đã xác nhận' : 'Chưa xác nhận' : number(value);
  const list = value => Array.isArray(value) ? value : [];
  function day(value) {
    const text = String(value || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }
  function dateLabel(value) {
    const d = day(value);
    return d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '';
  }
  function timeLabel(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(date);
  }
  function prepare(input) {
    const r = input || {}, students = list(r.students), byId = new Map(students.map(s => [String(s.id), s]));
    const aggregateAllowed = r.aggregateAllowed !== false, issuesOnly = r.aggregateAllowed === true || r.deficienciesOnly === true;
    const inRange = value => {
      if (aggregateAllowed) return true;
      const date = day(value), from = day(r.from), to = day(r.to);
      return Boolean(date) && (!from || date >= from) && (!to || date <= to);
    };
    const detailsAvailable = r.detailsIncluded !== false && Array.isArray(r.observations);
    const observations = (detailsAvailable ? r.observations : []).filter(row => inRange(row.lesson_date || row.observed_at)).sort((a, b) => String(a.lesson_date || a.observed_at || '').localeCompare(String(b.lesson_date || b.observed_at || '')) || Number(a.period_no || 0) - Number(b.period_no || 0));
    const sessions = list(r.sessions).filter(row => inRange(row.lesson_date)).sort((a, b) => String(a.lesson_date || '').localeCompare(String(b.lesson_date || '')) || Number(a.period_no || 0) - Number(b.period_no || 0) || String(a.class_code || '').localeCompare(String(b.class_code || ''), 'vi'));
    const student = row => {
      const found = byId.get(String(row.student_id || row.id || '')) || {};
      return { code: found.student_code || row.student_code || row.student_id || row.id || '', name: found.full_name || row.full_name || '', cls: row.class_code || found.class_code || '' };
    };
    const bySession = new Map(sessions.filter(row => row.id != null).map((row, index) => [String(row.id), { row, index }]));
    const rawAttendance = list(r.rawAttendance).flatMap(row => {
      const found = row.session_id == null ? null : bySession.get(String(row.session_id));
      // A row without a session in this report cannot be attributed to its week/class safely.
      return found ? [{ ...row, class_code: found.row.class_code || '', session: found.row, sessionIndex: found.index }] : [];
    }).sort((a, b) => a.sessionIndex - b.sessionIndex || student(a).name.localeCompare(student(b).name, 'vi') || student(a).code.localeCompare(student(b).code, 'vi'));
    const counts = new Map();
    for (const o of observations) {
      const key = String(o.student_id || '') + '\u0000' + student(o).cls;
      if (!counts.has(key)) counts.set(key, { student_id: o.student_id, class_code: student(o).cls, positive: 0, concern: 0, health: 0, total: 0 });
      const count = counts.get(key); count.total++;
      if (Object.hasOwn(categories, o.category)) count[o.category]++;
    }
    // Include students with no observations so a blank history is not mistaken for a missing student.
    for (const s of students) {
      const key = String(s.id) + '\u0000' + String(s.class_code || '');
      if (!counts.has(key)) counts.set(key, { student_id: s.id, class_code: s.class_code || '', positive: detailsAvailable ? 0 : '', concern: detailsAvailable ? 0 : '', health: detailsAvailable ? 0 : '', total: detailsAvailable ? 0 : '' });
      if (!detailsAvailable) {
        const count = counts.get(key);
        for (const category of Object.keys(categories)) count[category] = number(s[category]);
        count.total = Object.keys(categories).every(category => typeof count[category] === 'number') ? count.positive + count.concern + count.health : '';
      }
    }
    const attendance = list(r.attendance);
    for (const row of attendance) {
      const key = String(row.student_id || '') + '\u0000' + student(row).cls;
      if (issuesOnly && !counts.has(key)) counts.set(key, { student_id: row.student_id, class_code: student(row).cls, positive: 0, concern: 0, health: 0, total: 0 });
      const count = counts.get(key);
      if (count) { count.absent = Math.max(0, Number(row.absent) || 0); count.late = Math.max(0, Number(row.late) || 0); }
    }
    for (const row of counts.values()) { row.absent = row.absent || 0; row.late = row.late || 0; }
    const order = (a, b) => student(a).cls.localeCompare(student(b).cls, 'vi') || student(a).name.localeCompare(student(b).name, 'vi') || String(a.student_id).localeCompare(String(b.student_id));
    return {
      title: r.title || 'Báo cáo theo dõi học sinh', year: r.schoolYear || '', classLabel: r.classLabel || '', periodLabel: r.periodLabel || '', from: r.from || '', to: r.to || '',
      generatedAt: r.generatedAt || new Date().toISOString(), contextNote: r.contextNote || '', detailsIncluded: r.detailsIncluded, aggregateAllowed, issuesOnly, deficienciesOnly: r.deficienciesOnly === true, totals: aggregateAllowed ? list(r.totals) : [], observations, sessions, student, rawAttendance,lessonReviews:list(r.lessonReviews).filter(v=>sessions.some(s=>String(s.id)===String(v.session_id))),
      summary: aggregateAllowed ? Array.from(counts.values()).filter(row => !issuesOnly || Number(row.concern) > 0 || row.absent > 0 || row.late > 0).sort(order) : [], attendance: aggregateAllowed ? attendance.slice().sort(order) : []
    };
  }
  function filename(r, extension) {
    const part = String(r.classLabel || 'tong-hop').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 55) || 'tong-hop';
    return 'Bao-cao-' + part + '-' + (day(r.from) || day(r.generatedAt) || 'du-lieu') + (r.to && day(r.to) !== day(r.from) ? '-den-' + day(r.to) : '') + '.' + extension;
  }
  function download(bytes, type, name) {
    const blob = new Blob([bytes], { type });
    if(!root.document)return {filename:name,blob};
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; anchor.hidden = true; document.body.appendChild(anchor);
    try { anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
    return { filename: name, blob };
  }
  function xlsx(input) {
    const X = root.XLSX;
    if (!X || !X.utils) throw new Error('Chưa tải được thư viện Excel. Hãy tải lại trang rồi thử lại.');
    const r = prepare(input), wb = X.utils.book_new();
    const add = (name, rows, widths, filter) => {
      const sheet = X.utils.aoa_to_sheet(rows.map(row => row.map(safeCell)));
      sheet['!cols'] = widths.map(wch => ({ wch }));
      if (filter && rows.length > 1) sheet['!autofilter'] = { ref: sheet['!ref'] };
      X.utils.book_append_sheet(wb, sheet, name);
    };
    if (r.aggregateAllowed) {
      add('Tổng hợp', [[r.title], ['Trường', 'TH và THCS Trần Phú'], ['Năm học', r.year], ['Lớp', r.classLabel], ['Kỳ báo cáo', r.periodLabel], ['Từ ngày', dateLabel(r.from)], ['Đến ngày', dateLabel(r.to)], ['Lập lúc', timeLabel(r.generatedAt)], [], ['Chỉ tiêu', 'Số lượng'], ...r.totals.map(t => [t.name, number(t.count)]), [], ['Phạm vi', r.contextNote], ['Diễn giải', 'Số liệu là các tiết và ghi nhận có trên ứng dụng; không tự xếp loại học sinh.']], [43, 95]);
      if (r.issuesOnly) add('Học sinh', [['Mã học sinh', 'Họ và tên', 'Lớp', 'Cần cải thiện', 'Vắng', 'Muộn'], ...r.summary.map(row => { const s = r.student(row); return [s.code, s.name, s.cls, number(row.concern), row.absent, row.late]; })], [19, 32, 13, 18, 13, 13], true);
      else add('Học sinh', [['Mã học sinh', 'Họ và tên', 'Lớp', 'Tích cực', 'Cần cải thiện', 'Sức khỏe', 'Tổng ghi nhận'], ...r.summary.map(row => { const s = r.student(row); return [s.code, s.name, s.cls, row.positive, row.concern, row.health, row.total]; })], [19, 32, 13, 14, 18, 14, 19], true);
      add('Điểm danh', [['Mã học sinh', 'Họ và tên', 'Lớp', 'Số tiết mở của lớp', 'Đã xác nhận', 'Có mặt', 'Vắng', 'Muộn', 'Có phép'], ...r.attendance.map(row => { const s = r.student(row); return [s.code, s.name, s.cls, ...['total_sessions', 'confirmed', 'present', 'absent', 'late', 'excused'].map(k => number(row[k]))]; })], [19, 32, 13, 15, 17, 13, 13, 13, 13], true);
    } else {
      add('Thông tin', [[r.title], ['Trường', 'TH và THCS Trần Phú'], ['Năm học', r.year], ['Lớp', r.classLabel], ['Kỳ báo cáo', r.periodLabel], ['Từ ngày', dateLabel(r.from)], ['Đến ngày', dateLabel(r.to)], ['Lập lúc', timeLabel(r.generatedAt)], ['Phạm vi', r.contextNote]], [43, 95]);
    }
    add('Tiết học', [['Ngày', 'Tiết', 'Lớp', 'Môn', 'Giáo viên', 'Đã điểm danh', 'Kết thúc lúc', 'Tích cực', 'Cần cải thiện', 'Sức khỏe'], ...r.sessions.map(row => [dateLabel(row.lesson_date), number(row.period_no), row.class_code || '', row.subject || '', row.teacher_name || '', confirmed(row.attendance_confirmed), timeLabel(row.ended_at), number(row.positive), number(row.concern), number(row.health)])], [16, 9, 13, 25, 32, 20, 23, 14, 18, 14], true);
    if(r.lessonReviews.length)add('Nhận định tiết',[['Ngày','Tiết','Lớp','Môn','Nguồn nhận định','Trạng thái tiết','Nội dung','Giáo viên xác nhận','Xác nhận lúc'],...r.lessonReviews.map(v=>{const s=r.sessions.find(s=>String(s.id)===String(v.session_id));return [dateLabel(s.lesson_date),number(s.period_no),s.class_code,s.subject,reviewSource(v),reviewStage(v),v.note,reviewTeacher(v,s),v.source==='system'?'':timeLabel(v.confirmed_at)];})],[16,9,13,25,28,28,85,32,23],true);
    if (!r.aggregateAllowed) add('Điểm danh', [['Ngày', 'Tiết', 'Lớp', 'Môn', 'Giáo viên', 'Mã học sinh', 'Họ và tên', 'Trạng thái', 'Ghi chú', 'Cập nhật lúc'], ...r.rawAttendance.map(row => { const s = r.student(row), session = row.session; return [dateLabel(session.lesson_date), number(session.period_no), session.class_code || '', session.subject || '', session.teacher_name || '', s.code, s.name, attendanceLabels[row.status] || row.status || '', row.note || '', timeLabel(row.updated_at)]; })], [16, 9, 13, 25, 32, 19, 32, 17, 65, 23], true);
    add('Chi tiết', [['Ngày', 'Tiết', 'Mã học sinh', 'Họ và tên', 'Lớp', 'Môn', 'Giáo viên', 'Nhóm', 'Nội dung', 'Ghi chú', 'Ghi nhận lúc'], ...r.observations.map(row => { const s = r.student(row); return [dateLabel(row.lesson_date || row.observed_at), number(row.period_no), s.code, s.name, s.cls, row.subject || '', row.teacher_name || '', categories[row.category] || row.category || '', row.behavior_code || '', row.note || '', timeLabel(row.observed_at)]; })], [16, 9, 19, 32, 13, 25, 32, 18, 30, 65, 23], true);
    wb.Props = { Title: r.title, Subject: r.periodLabel, Author: 'Trường TH và THCS Trần Phú' };
    return download(X.write(wb, { type: 'array', bookType: 'xlsx', compression: true }), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename(r, 'xlsx'));
  }
  const p = (text, style) => '<w:p>' + (style ? '<w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' : '') + String(text == null ? '' : text).split(/\r?\n/).map((line, i) => '<w:r>' + (i ? '<w:br/>' : '') + '<w:t xml:space="preserve">' + xml(line) + '</w:t></w:r>').join('') + '</w:p>';
  function table(headers, rows, widths) {
    const row = (cells, header) => '<w:tr>' + ('<w:trPr><w:cantSplit/>' + (header ? '<w:tblHeader/>' : '') + '</w:trPr>') + cells.map((cell, i) => '<w:tc><w:tcPr><w:tcW w:w="' + widths[i] + '" w:type="dxa"/>' + (header ? '<w:shd w:fill="E8F2FF"/>' : '') + '<w:vAlign w:val="center"/></w:tcPr>' + p(cell, header ? 'TableHeader' : 'TableText') + '</w:tc>').join('') + '</w:tr>';
    return '<w:tbl><w:tblPr><w:tblW w:w="9746" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="CFD8E3"/><w:left w:val="single" w:sz="4" w:color="CFD8E3"/><w:bottom w:val="single" w:sz="4" w:color="CFD8E3"/><w:right w:val="single" w:sz="4" w:color="CFD8E3"/><w:insideH w:val="single" w:sz="4" w:color="CFD8E3"/><w:insideV w:val="single" w:sz="4" w:color="CFD8E3"/></w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' + widths.map(w => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>' + row(headers, true) + rows.map(cells => row(cells, false)).join('') + '</w:tbl>' + p('');
  }
  function word(input) {
    if (input && input.aggregateAllowed === false) throw new Error('Chỉ giáo viên chủ nhiệm và quản trị được xuất báo cáo Word tổng hợp.');
    const CFB = root.XLSX && root.XLSX.CFB;
    if (!CFB || !CFB.utils) throw new Error('Chưa tải được thư viện xuất Word. Hãy tải lại trang rồi thử lại.');
    const r = prepare(input), identity = row => { const s = r.student(row); return s.name + (s.code ? '\n' + s.code : '') + (s.cls ? ' · ' + s.cls : ''); };
    const wordObservations = r.deficienciesOnly ? r.observations.filter(row => row.category === 'concern') : r.observations;
    let body = p('TRƯỜNG TH VÀ THCS TRẦN PHÚ', 'School') + p(r.title, 'Title') + p([r.classLabel, r.year && 'Năm học ' + r.year, r.periodLabel].filter(Boolean).join(' · '), 'Subtitle') + p('Thời gian: ' + dateLabel(r.from) + ' đến ' + dateLabel(r.to)) + p('Lập báo cáo: ' + timeLabel(r.generatedAt));
    if (r.contextNote) body += p(r.contextNote);
    if (!r.issuesOnly) body += p('Báo cáo tổng hợp các tiết học, điểm danh và nhận xét để giáo viên theo dõi học sinh. Số lần ghi nhận không thay thế kết luận đánh giá của giáo viên.');
    if (r.totals.length && (!r.issuesOnly || r.summary.length)) body += p('Tổng hợp', 'Heading1') + table(['Chỉ tiêu', 'Số lượng'], r.totals.map(t => [t.name, number(t.count)]), [7346, 2400]);
    if (r.issuesOnly) {
      if (r.summary.length) body += p('Học sinh cần cải thiện', 'Heading1') + table(['Học sinh', 'Cần cải thiện', 'Vắng', 'Muộn'], r.summary.map(row => [identity(row), number(row.concern), row.absent, row.late]), [5146, 2000, 1300, 1300]);
      const attendanceIssues = r.attendance.filter(row => Number(row.absent) > 0 || Number(row.late) > 0);
      if (attendanceIssues.length) body += p('Vắng và đi muộn', 'Heading1') + table(['Học sinh', 'Vắng', 'Muộn'], attendanceIssues.map(row => [identity(row), number(row.absent), number(row.late)]), [6746, 1500, 1500]);
    } else {
      body += p('Theo dõi học sinh', 'Heading1');
      body += r.summary.length ? table(['Học sinh', 'Tích cực', 'Cần cải thiện', 'Sức khỏe', 'Tổng'], r.summary.map(row => [identity(row), row.positive, row.concern, row.health, row.total]), [4546, 1300, 1500, 1300, 1100]) : p('Chưa có học sinh trong phạm vi báo cáo.');
      body += p('Điểm danh', 'Heading1');
      body += r.attendance.length ? table(['Học sinh', 'Số tiết', 'Xác nhận', 'Có mặt', 'Vắng', 'Muộn', 'Có phép'], r.attendance.map(row => [identity(row), ...['total_sessions', 'confirmed', 'present', 'absent', 'late', 'excused'].map(k => number(row[k]))]), [3446, 1000, 1200, 1100, 1000, 1000, 1000]) : p('Chưa có dữ liệu điểm danh trong phạm vi báo cáo.');
    }
    if (r.sessions.length) body += p('Các tiết học', 'Heading1') + table(['Ngày và tiết', 'Lớp và môn', 'Giáo viên', 'Đã điểm danh', r.deficienciesOnly ? 'Cần cải thiện' : 'Ghi nhận'], r.sessions.map(row => [dateLabel(row.lesson_date) + '\nTiết ' + (row.period_no || ''), [row.class_code, row.subject].filter(Boolean).join('\n'), row.teacher_name || '', typeof row.attendance_confirmed === 'number' ? row.attendance_confirmed + ' học sinh' : confirmed(row.attendance_confirmed), r.deficienciesOnly ? number(row.concern) : 'Tích cực: ' + number(row.positive) + '\nCần cải thiện: ' + number(row.concern) + '\nSức khỏe: ' + number(row.health)]), [1500, 2100, 2246, 1700, 2200]);
    if(r.lessonReviews.length)body+=p('Nhận định chung tiết học','Heading1')+table(['Tiết học','Nguồn / trạng thái','Nội dung','Giáo viên xác nhận'],r.lessonReviews.map(v=>{const s=r.sessions.find(s=>String(s.id)===String(v.session_id));return [dateLabel(s.lesson_date)+'\nTiết '+s.period_no+' · '+s.class_code+'\n'+s.subject,[reviewSource(v),reviewStage(v)].filter(Boolean).join('\n'),v.note,reviewTeacher(v,s)];}),[2400,2000,3846,1500]);
    if (wordObservations.length || !r.deficienciesOnly) {
      body += p('Chi tiết nhận xét theo tiết', 'Heading1');
      body += wordObservations.length ? table(['Ngày và tiết', 'Học sinh', 'Nhận xét', 'Giáo viên'], wordObservations.map(row => [dateLabel(row.lesson_date || row.observed_at) + (row.period_no ? '\nTiết ' + row.period_no : '') + (row.subject ? '\n' + row.subject : ''), identity(row), [categories[row.category] || row.category, row.behavior_code, row.note].filter(Boolean).join('\n'), row.teacher_name || '']), [1500, 2300, 3946, 2000]) : p(r.detailsIncluded === false ? 'Báo cáo này chỉ gồm số liệu tổng hợp, không kèm từng nhận xét.' : 'Chưa có nhận xét trong phạm vi báo cáo.');
    }
    const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="360" w:footer="360"/></w:sectPr></w:body></w:document>';
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="School"><w:name w:val="School"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="160"/></w:pPr><w:rPr><w:b/><w:sz w:val="20"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="180"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="34"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="180"/></w:pPr><w:rPr><w:color w:val="475569"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="164B80"/><w:sz w:val="25"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="30" w:line="252" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="19"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="TableHeader"><w:name w:val="Table Header"/><w:basedOn w:val="TableText"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/></w:rPr></w:style></w:styles>';
    const parts = {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      'word/document.xml': documentXml,
      'word/styles.xml': styles,
      'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
    };
    const zip = CFB.utils.cfb_new();
    Object.entries(parts).forEach(([name, value]) => CFB.utils.cfb_add(zip, name, new TextEncoder().encode(value)));
    return download(CFB.write(zip, { type: 'array', fileType: 'zip', compression: true }), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename(r, 'docx'));
  }
  root.TranPhuReportExport = Object.freeze({ xlsx, word });
})(window);
