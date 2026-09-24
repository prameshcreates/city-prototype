export function createHud(onStart) {
  const root = document.getElementById('hud');
  root.innerHTML = `
    <div id="hint">
      <h1>CITY PROTOTYPE</h1>
      <table>
        <tr><td>Mouse</td><td>look (click to lock, Esc to release)</td></tr>
        <tr><td>W A S D</td><td>move / drive</td></tr>
        <tr><td>Shift</td><td>sprint</td></tr>
        <tr><td>Space</td><td>jump / handbrake</td></tr>
        <tr><td>S</td><td>brake / reverse</td></tr>
        <tr><td>E</td><td>enter / exit car</td></tr>
      </table>
      <p>Click to play</p>
    </div>
    <div id="prompt" hidden></div>
    <div id="speed" hidden><span>0</span><small>KM/H</small></div>`;
  const hint = root.querySelector('#hint');
  const prompt = root.querySelector('#prompt');
  const speed = root.querySelector('#speed');
  const speedValue = speed.querySelector('span');
  let promptText = null;
  let shownSpeed = -1;

  hint.addEventListener('click', onStart);

  return {
    hideHint() { hint.hidden = true; },
    showHint() { hint.hidden = false; },
    setPrompt(html) {
      if (html === promptText) return;
      promptText = html;
      prompt.hidden = !html;
      if (html) prompt.innerHTML = html;
    },
    setSpeed(kmh) {
      speed.hidden = kmh === null;
      if (kmh === null) return;
      const v = Math.round(kmh);
      if (v !== shownSpeed) speedValue.textContent = shownSpeed = v;
    },
  };
}
