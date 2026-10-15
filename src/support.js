// Owner-provided original payment images. Keep the full images and QR quiet zones intact.
export const SUPPORT_METHODS = [
  { name: '微信支付', image: './assets/support/wechat.jpg' },
  { name: '支付宝', image: './assets/support/alipay.jpg' },
];

const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const methods = () => SUPPORT_METHODS.filter(method => typeof method.name === 'string' && method.name.trim()
  && /^\.\/assets\/support\/[a-zA-Z0-9_-]+\.(png|jpe?g|webp)$/i.test(method.image));

export function supportAvailable() { return methods().length === 2; }

export function renderSupportCallout() {
  if (!supportAvailable()) return '';
  return `<section class="support-callout" aria-labelledby="support-callout-title"><span class="support-callout-icon" aria-hidden="true">♡</span><div class="support-callout-copy"><h2 id="support-callout-title">这份解读，给了你一点启发吗？</h2><p>请星间喝杯茶，支持这个小小的塔罗空间。<span>自愿支持 · 金额随心</span></p></div><button class="button primary" data-action="support" aria-haspopup="dialog">请星间喝杯茶 <span aria-hidden="true">↗</span></button></section>`;
}

export function renderSupport() {
  if (!supportAvailable()) return '';
  return `<div class="support-dialog"><p class="eyebrow">A LITTLE KINDNESS, A LITTLE LIGHT</p><h2 class="modal-title" id="modal-title">请星间喝杯茶</h2><p class="support-intro">如果这段小小的对话带给你一点启发，也欢迎留下一份心意，支持星间继续陪伴大家。</p><p class="support-voluntary">自愿支持 · 金额随心</p><div class="support-methods">${methods().map(method => `<figure class="support-method"><figcaption>${escape(method.name)}<small>点图查看原图 ↗</small></figcaption><a class="support-image-link" href="${escape(method.image)}" target="_blank" rel="noopener noreferrer" aria-label="打开${escape(method.name)}收款码原图"><img class="support-qr" src="${escape(method.image)}" alt="${escape(method.name)}收款码"></a><p class="support-image-error" role="status" hidden>收款码暂时未能加载，请稍后再试。</p><a class="text-button support-save" href="${escape(method.image)}" download>保存收款码 ↓</a></figure>`).join('')}</div><p class="support-help">电脑上可用手机扫码。手机上可点图片打开原图，长按保存到相册，再用对应支付应用从相册识别。</p><p class="support-thanks">谢谢你，让这片小小的星光继续亮着。</p></div>`;
}

export function bindSupportImages(root) {
  root.querySelectorAll('.support-qr').forEach(image => {
    const showError = () => {
      const figure = image.closest('.support-method');
      figure.querySelector('.support-image-link').hidden = true;
      figure.querySelector('.support-save').hidden = true;
      figure.querySelector('.support-image-error').hidden = false;
    };
    image.addEventListener('error', showError, { once: true });
    if (image.complete && !image.naturalWidth) showError();
  });
}
