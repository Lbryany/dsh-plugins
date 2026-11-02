// Semantic, trusted browser actions. Never evaluates generated script to set values or submit.
export async function performActions(page, frame, task, snapshot, result) {
  const controls = snapshot.controls;
  const locator = c => frame.locator('input,select,textarea,button').nth(c.index);
  const identity = c => [c.name, c.id, c.label, c.ariaLabel ?? ''].join(' ');
  async function number(pattern, value, fallback = false) {
    const numbers = controls.filter(c => c.tag === 'INPUT' && ['number', 'range'].includes(c.type));
    const found = numbers.find(c => pattern.test(identity(c))) ?? (fallback && numbers.length === 1 ? numbers[0] : null);
    if (!found) return choice(pattern, [String(value)]);
    const target = task.id === 'IC-E03' && Number(found.max) > 1 ? value * 100 : value;
    const el = locator(found);
    if (found.type === 'range') {
      const min = Number(found.min || 0), step = Number(found.step || 1);
      const steps = Math.round((target - min) / step);
      if (steps < 0 || steps > 200 || Math.abs(min + steps * step - target) > 1e-6) throw new Error('Range cannot represent target');
      await el.focus(); await el.press('Home');
      for (let i = 0; i < steps; i++) await el.press('ArrowRight');
    } else { await el.fill(String(target)); await el.press('Tab'); }
    result.actions.push({ control: identity(found), value: await el.inputValue(), intended: value });
  }
  async function choice(pattern, aliases) {
    const match = value => aliases.some(a => String(value).toLowerCase() === a.toLowerCase());
    const textMatch = value => aliases.some(a => String(value).toLowerCase().includes(a.toLowerCase()));
    const select = controls.find(c => c.tag === 'SELECT' && pattern.test(identity(c)))
      ?? controls.find(c => c.tag === 'SELECT' && c.options.some(o => match(o.value) || textMatch(o.text)));
    if (select) {
      const option = select.options.find(o => match(o.value)) ?? select.options.find(o => textMatch(o.text));
      if (!option) throw new Error('No requested option: ' + aliases.join('/'));
      await locator(select).selectOption(option.value);
      result.actions.push({ control: identity(select), value: option.value, label: option.text }); return;
    }
    const radio = controls.find(c => c.type === 'radio' && (match(c.value) || textMatch(c.label)));
    if (radio) { await locator(radio).focus(); await locator(radio).press('Space'); if (!await locator(radio).isChecked()) throw new Error('Radio did not retain keyboard selection'); result.actions.push({ control: identity(radio), value: radio.value }); return; }
    const button = controls.find(c => c.tag === 'BUTTON' && textMatch(c.text));
    if (button) { await locator(button).click(); result.actions.push({ button: button.text }); return; }
    throw new Error('Cannot locate option semantically: ' + aliases.join('/'));
  }
  if (task.id === 'IC-E01') { await number(/hours|时长|用量|usage/i, 30, true); await choice(/plan|方案/i, ['B', '方案 B', '方案B']); }
  if (task.id === 'IC-E02') { await number(/night|晚|住宿/i, 2); await choice(/ambience|氛围|风格|偏好/i, ['quiet', '安静']); await number(/budget|预算/i, 8000); }
  if (task.id === 'IC-E03') await number(/(^|\W)k($|\W)|coeff|冷却|系数|kHundredths/i, 0.2, true);
  if (task.id === 'IC-E04') await choice(/region|地区/i, ['east', '华东', 'East China']);
  if (task.id === 'IC-E05') { await number(/participant|people|count|人数/i, 12); await number(/duration|minute|时长|时间/i, 90); await choice(/format|mode|形式/i, ['onsite', 'offline', '线下']); }
  if (task.id === 'IC-E06') { await number(/radius|圆角/i, 12); await choice(/density|密度/i, ['compact', '紧凑']); await choice(/accent|color|颜色|强调色/i, ['green', '绿色', '绿']); }
  const submitPattern = /提交|继续|分析|应用|完善|生成议程|发送|解释.*选择|按.*选择/;
  if (task.kind === 'negative') {
    result.exposedSubmit = (await page.locator('[data-dsh-interaction-bar]:visible').count()) > 0 || controls.some(c => c.tag === 'BUTTON' && submitPattern.test(c.text));
    if (task.id === 'IC-N02') {
      await frame.getByRole('button', { name: /下一步/ }).click();
      result.afterNext = await frame.locator('body').innerText();
      await frame.getByRole('button', { name: /重置/ }).click();
      result.afterReset = await frame.locator('body').innerText();
    }
    return;
  }
  // Let independent draft saves settle; the host capture still reads current fields.
  await page.waitForTimeout(300);
  const hostButton = page.locator('[data-dsh-interaction-bar]:visible').last().getByRole('button').first();
  if (await hostButton.count()) await hostButton.click();
  else {
    const matching = controls.filter(c => c.tag === 'BUTTON' && submitPattern.test(c.text));
    const button = matching.filter(c => /提交|确认|分析|解释|完善|选择|样式/.test(c.text)).at(-1) ?? matching.at(-1);
    if (!button) throw new Error('Generated card has no submit action');
    await locator(button).click();
  }
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: /确认并继续|^发送$|^Send$/ }) }).last();
  await dialog.waitFor();
  result.preview = await dialog.innerText();
  await dialog.getByRole('button', { name: /确认并继续|^发送$|^Send$/ }).click();
  result.actions.push({ action: 'confirmed-host-dialog' });
  result.submitted = true;
  await page.waitForTimeout(700);
}
