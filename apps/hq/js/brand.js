/* =============================================================================
   BRAND -white-label identity shared by the app chrome, cards, reports,
   invoices, and exported client portals.
   ============================================================================= */
const Brand = {};

Brand.settings = () => DB.settings || {};
Brand.name = () => (Brand.settings().businessName || 'CoachSBC HQ').trim();
Brand.tagline = () => (Brand.settings().brandTagline || 'Performance coaching').trim();
Brand.logo = () => Brand.settings().brandLogo || '';
Brand.accent = () => typeof Data !== 'undefined' ? Data.accentHexNow() : '#ff4655';
Brand.footer = () => (Brand.settings().brandFooter || `${Brand.name()} - Performance coaching`).trim();
Brand.poweredBy = () => Brand.settings().brandPoweredBy !== false;
Brand.contact = () => [Brand.settings().brandEmail, Brand.settings().brandWebsite].filter(Boolean).join(' - ');
Brand.logoHtml = function (className = 'brand-logo') {
  return Brand.logo() ? `<img class="${className}" src="${UI.escape(Brand.logo())}" alt="">` : '<span class="dot"></span>';
};
Brand.attribution = function () {
  return Brand.poweredBy() && Brand.name() !== 'CoachSBC HQ' ? 'Powered by CoachSBC HQ' : '';
};

Brand.apply = function () {
  const host = document.getElementById('app-brand');
  if (host) host.innerHTML = `${Brand.logoHtml('app-brand-logo')}<span id="app-brand-name">${UI.escape(Brand.name())}</span>`;
  document.title = Brand.name();
};

Brand.summaryHtml = function () {
  return `<div class="brand-summary">
    <div class="brand-preview">${Brand.logo() ? `<img src="${UI.escape(Brand.logo())}" alt="">` : '<span class="dot"></span>'}</div>
    <div><b>${UI.escape(Brand.name())}</b><div class="muted">${UI.escape(Brand.tagline())}</div></div>
    <button class="btn btn-sm" onclick="Brand.edit()">Edit brand kit</button>
  </div>`;
};

Brand.edit = function () {
  const s = Brand.settings();
  Brand._draftLogo = Brand.logo();
  UI.modal(`<div class="modal-head"><h2>White-label Brand Kit</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <div class="brand-editor-preview">
      <div id="brand-logo-preview" class="brand-logo-preview">${Brand._draftLogo ? `<img src="${UI.escape(Brand._draftLogo)}" alt="">` : '<span class="dot"></span>'}</div>
      <div><b id="brand-name-preview">${UI.escape(Brand.name())}</b><div class="muted" id="brand-tag-preview">${UI.escape(Brand.tagline())}</div></div>
    </div>
    <label class="field"><span>Coach or business name</span><input id="brand-name" maxlength="60" value="${UI.escape(Brand.name())}" placeholder="Apex Aim Coaching" oninput="Brand.previewText()"></label>
    <label class="field"><span>Tagline</span><input id="brand-tagline" maxlength="100" value="${UI.escape(Brand.tagline())}" placeholder="Build better players" oninput="Brand.previewText()"></label>
    <div class="row">
      <label class="field"><span>Contact email</span><input id="brand-email" type="email" value="${UI.escape(s.brandEmail || '')}" placeholder="coach@example.com"></label>
      <label class="field"><span>Website</span><input id="brand-website" value="${UI.escape(s.brandWebsite || '')}" placeholder="https://example.com"></label>
    </div>
    <label class="field"><span>Report and portal footer</span><input id="brand-footer" maxlength="140" value="${UI.escape(s.brandFooter || '')}" placeholder="${UI.escape(Brand.name())} - Performance coaching"></label>
    <label class="field"><span>Logo (PNG, JPG, or WebP - maximum 1.5 MB)</span><div class="flex gap-sm wrap"><input id="brand-logo-file" type="file" accept="image/png,image/jpeg,image/webp" onchange="Brand.readLogo(this)" style="flex:1"><button class="btn btn-ghost" onclick="Brand.removeLogo()">Remove logo</button></div></label>
    <label class="flex center gap-sm" style="cursor:pointer;margin:.75rem 0"><input id="brand-powered" type="checkbox" style="width:auto" ${Brand.poweredBy() ? 'checked' : ''}><span>Show "Powered by CoachSBC HQ" on branded exports</span></label>
    <p class="muted" style="font-size:.75rem">Your current accent colour is used automatically across cards, portals, reports, and invoices. Change it in Appearance.</p>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button><button class="btn btn-primary" onclick="Brand.save()">Save brand kit</button></div>`);
};

Brand.previewText = function () {
  const name = document.getElementById('brand-name-preview');
  const tag = document.getElementById('brand-tag-preview');
  if (name) name.textContent = document.getElementById('brand-name').value || 'CoachSBC HQ';
  if (tag) tag.textContent = document.getElementById('brand-tagline').value || 'Performance coaching';
};
Brand.readLogo = function (input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { UI.toast('Choose a PNG, JPG, or WebP image.', 'bad'); input.value = ''; return; }
  if (file.size > 1.5 * 1024 * 1024) { UI.toast('Logo must be smaller than 1.5 MB.', 'bad'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = () => {
    Brand._draftLogo = reader.result;
    document.getElementById('brand-logo-preview').innerHTML = `<img src="${UI.escape(Brand._draftLogo)}" alt="">`;
  };
  reader.readAsDataURL(file);
};
Brand.removeLogo = function () {
  Brand._draftLogo = '';
  const preview = document.getElementById('brand-logo-preview');
  if (preview) preview.innerHTML = '<span class="dot"></span>';
};
Brand.save = function () {
  const name = document.getElementById('brand-name').value.trim();
  if (!name) { UI.toast('Business name is required.', 'bad'); return; }
  DB.settings ||= {};
  Object.assign(DB.settings, {
    businessName: name,
    brandTagline: document.getElementById('brand-tagline').value.trim(),
    brandEmail: document.getElementById('brand-email').value.trim(),
    brandWebsite: document.getElementById('brand-website').value.trim(),
    brandFooter: document.getElementById('brand-footer').value.trim(),
    brandLogo: Brand._draftLogo || '',
    brandPoweredBy: document.getElementById('brand-powered').checked,
  });
  saveDB();
  Brand.apply();
  UI.closeModal();
  UI.toast('Brand kit applied.', 'good');
};




