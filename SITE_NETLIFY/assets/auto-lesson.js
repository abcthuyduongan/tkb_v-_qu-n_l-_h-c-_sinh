/* Display the lesson clock. Server rules decide when data may be written. */
(() => {
  'use strict';
  const zone = 'Asia/Ho_Chi_Minh';
  let sessionKey = null, serverStatus = null, serverOffset = 0, requestNumber = 0, pendingRequest = null, publishedKey = '', published = null;
  const schoolDay = value => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  const clock = value => new Intl.DateTimeFormat('vi-VN', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
  const displayDay = value => { const text = String(value || '').slice(0, 10); return text.slice(8, 10) + '/' + text.slice(5, 7) + '/' + text.slice(0, 4); };
  const timestamp = (day, time) => /^\d{4}-\d{2}-\d{2}$/.test(day) && /^\d{2}:\d{2}(?::\d{2})?$/.test(time || '') ? Date.parse(day + 'T' + time + (time.length === 5 ? ':00' : '') + '+07:00') : NaN;
  function status(context, now) {
    const session = context?.session;
    if (!session || context.classCode && session.class_code && context.classCode !== session.class_code) return null;
    const date = String(session.lesson_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const today = schoolDay(now), time = (context.times || []).find(item => Number(item.period_no) === Number(session.period_no));
    const start = timestamp(date, time?.start_time);
    // A local end-time fallback is only for the explicit demonstration mode.
    const scheduledEnd = serverStatus?.scheduled_end_at || session.scheduled_end_at;
    const end = scheduledEnd ? Date.parse(scheduledEnd) : context.demo ? timestamp(date, time?.end_time) : NaN;
    const schedule = Number.isFinite(end) ? 'Tiết ' + session.period_no + (Number.isFinite(start) ? ': ' + clock(start) + '–' : ' đến ') + clock(end) + ' (giờ Việt Nam). ' : '';
    const withinDay = 'Ghi nhận trong ngày học; sang ngày mới chỉ xem lại.';
    if (date < today) return { state: 'ended', text: 'Đã kết thúc', description: 'Tiết học ngày ' + displayDay(date) + ' đã kết thúc. Chỉ được xem lại, không ghi nhận cho ngày trước.' };
    if (date > today) return { state: 'upcoming', text: 'Chưa đến giờ', description: 'Tiết học ngày ' + displayDay(date) + '. ' + schedule + withinDay };
    const manuallyEnded = serverStatus ? serverStatus.manual_ended_at : session.ended_at;
    if (manuallyEnded) return { state: 'ended', text: 'Đã kết thúc', description: schedule + withinDay };
    if (Number.isFinite(end) && now >= end) return { state: 'elapsed', text: 'Đã hết giờ', description: schedule + withinDay };
    if (Number.isFinite(start) && now < start) return { state: 'upcoming', text: 'Chưa đến giờ', description: schedule + withinDay };
    if (!Number.isFinite(end)) return null;
    return { state: 'active', text: 'Đang trong giờ', description: schedule + withinDay };
  }
  function ensureSession(context) {
    const key = context?.session?.id ? (context.demo ? 'demo:' : 'real:') + context.session.id : null;
    if (key === sessionKey) return false;
    sessionKey = key; serverStatus = null; serverOffset = 0; requestNumber++; pendingRequest = null; publishedKey = ''; published = null;
    return true;
  }
  function paint(context) {
    const element = document.getElementById('lessonAutoStatus');
    if (!element) return;
    const now = Date.now() + serverOffset, value = status(context, now);
    if (!value) {
      if (!element.hidden) element.hidden = true;
      published = null; publishedKey = '';
      return;
    }
    if (element.textContent !== value.text) element.textContent = value.text;
    const attributes = { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true', 'aria-label': value.text + '. ' + value.description, title: value.description, 'data-state': value.state, tabindex: '0' };
    for (const [key, value] of Object.entries(attributes)) if (element.getAttribute(key) !== value) element.setAttribute(key, value);
    if (element.hidden) element.hidden = false;
    const date = String(context.session.lesson_date || '').slice(0, 10), today = schoolDay(now);
    const canWrite = date !== today ? false : serverStatus ? !!serverStatus.can_write : undefined;
    const key = [sessionKey, value.state, today, canWrite].join('|');
    if (key !== publishedKey) {
      publishedKey = key;
      published = Object.freeze({ sessionId: context.session.id, canWrite, state: value.state, scheduledEndAt: serverStatus?.scheduled_end_at || context.session.scheduled_end_at || null, schoolToday: today });
      document.dispatchEvent(new CustomEvent('tranphu:lesson-status', { detail: published }));
    }
  }
  async function refresh() {
    const context = window.TranPhuReportsContext?.();
    ensureSession(context); paint(context);
    if (!sessionKey || context.demo || !context.client?.rpc || pendingRequest === sessionKey) return;
    const key = sessionKey, revision = ++requestNumber;
    pendingRequest = key;
    try {
      const result = await context.client.rpc('v4_session_status', { sess: context.session.id });
      if (revision !== requestNumber || key !== sessionKey || result.error) return;
      const current = window.TranPhuReportsContext?.();
      if (!current?.session || (current.demo ? 'demo:' : 'real:') + current.session.id !== key) { render(); return; }
      const data = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!data) return;
      const serverNow = Date.parse(data.server_now);
      if (Number.isFinite(serverNow)) serverOffset = serverNow - Date.now();
      serverStatus = data;
      paint(current);
    } catch (_) {
      // Keep the last server schedule/status while disconnected. Writing stays server-guarded.
    } finally {
      if (key === sessionKey && revision === requestNumber) pendingRequest = null;
    }
  }
  function render() {
    const context = window.TranPhuReportsContext?.(), changed = ensureSession(context);
    paint(context);
    if (changed) refresh();
  }
  function start() {
    render();
    let pending = false;
    const changed = () => { if (pending) return; pending = true; queueMicrotask(() => { pending = false; render(); }); };
    const observer = new MutationObserver(changed);
    // Watch application context changes, not the status's own text/attributes.
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-page'] });
    for (const id of ['lessonLabel', 'lessonClass']) {
      const element = document.getElementById(id);
      if (element) observer.observe(element, { childList: true, subtree: true, characterData: true });
    }
    const page = document.getElementById('classPage');
    if (page) observer.observe(page, { attributes: true, attributeFilter: ['hidden'] });
    setInterval(render, 15000);
    setInterval(() => { if (!document.hidden) refresh(); }, 60000);
    window.addEventListener('focus', () => { render(); refresh(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); refresh(); } });
  }
  window.TranPhuAutoLesson = Object.freeze({ render, refresh, getStatus: () => published });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
