/** Frame helper installed after the host bridge. Generated pages declare fields, not transactions. */
export function interactionHelperScript(): string {
  return `
(function () {
  var owned = false;
  window.dshViz.interaction = function (definition) {
    if (owned) throw new Error('Only one interaction per card');
    var form = definition.form, fields = definition.fields, action = definition.action;
    if (!form || form.tagName !== 'FORM' || !fields || !action || !action.label || !action.intent) throw new Error('An interaction requires a form, fields and action');
    var names = Object.keys(fields), elements = {}, fieldLabels = {};
    if (!names.length || names.length > 64) throw new Error('Declare 1 to 64 fields');
    names.forEach(function (name) {
      if (name === '__proto__' || name === 'constructor' || name === 'prototype') throw new Error('Invalid field name');
      var matches = Array.from(form.elements).filter(function (el) { return el.name === name; });
      if (!matches.length || (matches.length > 1 && !matches.every(function (el) { return el.type === 'radio'; }))) throw new Error('Missing or ambiguous field: ' + name);
      elements[name] = matches;
      var el = matches[0], label = el.labels && el.labels[0];
      if (el.type === 'radio') label = el.closest('fieldset') && el.closest('fieldset').querySelector('legend');
      var text = fields[name].label;
      if (!text && label) {
        var copy = label.cloneNode(true);
        copy.querySelectorAll('input, select, textarea, button, output, [aria-hidden="true"]').forEach(function (node) { node.remove(); });
        text = copy.textContent;
      }
      fieldLabels[name] = String(text || el.getAttribute('aria-label') || name).replace(/\\s+/g, ' ').trim().slice(0, 100) || name;
    });
    function check(name, value) {
      var spec = fields[name];
      if (spec.type === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value) || (spec.min !== undefined && value < spec.min) || (spec.max !== undefined && value > spec.max) || (spec.step !== undefined && Math.abs((value - (spec.min || 0)) / spec.step - Math.round((value - (spec.min || 0)) / spec.step)) > 1e-7)) throw new Error('Invalid number: ' + name);
      } else if (spec.type === 'enum') {
        if (!Array.isArray(spec.values) || spec.values.indexOf(value) === -1) throw new Error('Invalid option: ' + name);
      } else if (spec.type === 'boolean') {
        if (typeof value !== 'boolean') throw new Error('Invalid boolean: ' + name);
      } else if (spec.type === 'text') {
        if (typeof value !== 'string' || value.length > (spec.maxLength || 1000)) throw new Error('Invalid text: ' + name);
      } else throw new Error('Unsupported field type: ' + name);
      return value;
    }
    function read() {
      var result = {};
      names.forEach(function (name) {
        var list = elements[name], el = list[0], value;
        if (el.type === 'radio') value = (list.find(function (item) { return item.checked; }) || {}).value;
        else if (fields[name].type === 'boolean') value = el.checked;
        else if (fields[name].type === 'number') value = el.value.trim() === '' ? NaN : Number(el.value);
        else value = el.value;
        result[name] = check(name, value);
      });
      return result;
    }
    var status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.setAttribute('data-dsh-interaction-status', '');
    form.appendChild(status);
    var saved = window.dsh.widgetState;
    names.forEach(function (name) {
      if (!saved || !saved.modelContent || !Object.prototype.hasOwnProperty.call(saved.modelContent, name)) return;
      var value = saved.modelContent[name];
      try { check(name, value); } catch (_) { status.textContent = '部分旧选项无效，已使用默认值'; return; }
      elements[name].forEach(function (el) {
        if (el.type === 'radio') el.checked = el.value === value;
        else if (fields[name].type === 'boolean') el.checked = value;
        else el.value = String(value);
      });
    });
    var disposed = false, version = 0;
    function render() { var values = read(); if (definition.render) definition.render(values); return values; }
    function local() { try { render(); } catch (error) { status.textContent = error.message; } }
    function save() {
      var current = ++version, values;
      try { values = render(); } catch (error) { status.textContent = error.message; return; }
      status.textContent = '保存中…';
      window.dsh.setWidgetState({ modelContent: values, privateContent: saved ? saved.privateContent : null }).then(function () {
        if (!disposed && current === version) status.textContent = '选择已保存';
      }, function () { if (!disposed && current === version) status.textContent = '保存失败；当前选择仍可预览，请重试'; });
    }
    function preventSubmit(event) { event.preventDefault(); }
    render();
    owned = true;
    form.addEventListener('input', local);
    form.addEventListener('change', save);
    form.addEventListener('submit', preventSubmit);
    window.dsh.registerInteraction({ label: action.label, intent: action.intent, fieldLabels: fieldLabels }, read).then(function (capability) {
      if (!disposed && !capability.supported) status.textContent = '此窗口暂不支持提交，请返回支持交互的对话';
    }, function () { if (!disposed) status.textContent = '交互连接失败，请返回对话重试'; });
    return function () {
      if (disposed) return;
      disposed = true;
      form.removeEventListener('input', local);
      form.removeEventListener('change', save);
      form.removeEventListener('submit', preventSubmit);
      status.remove();
    };
  };
})();
`
}
