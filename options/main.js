import * as storage from '../lib/storage/products.js';
import * as utils from '../lib/utils.js';

createProductList().catch(console.error);

async function createProductList() {
  const $list = document.querySelector('.product-list');
  const products = await storage.all();

  let html = `<table>
  <thead><tr class="title">
    <th class="image">商品图</th>
    <th class="name">商品名</th>
    <th class="price-prev">之前的价格</th>
    <th class="price-now">当前的价格</th>
    <th class="price-changed">价格变化情况</th>
    <th class="operation">操作</th>
  </tr></thead>
  <tbody>`;
  Object.keys(products).forEach((id) => {
    const product = products[id];
    const priceNow = product.priceNow;
    // 历史价格按更新时间降序排列，[0] 为前一次的价格
    const pricePrev = product.priceHistory[0] || { value: 0, currency: '无' };
    const priceDiff = priceNow.value - pricePrev.value;

    html += `<tr class="product" data-id="${product.id}">
      <td class="image"><img src="${product.images[0]}"/></td>
      <td class="name">
        <a href="${product.url}" target="_blank">${product.name}</a>
      </td>
      <td class="price-prev ${pricePrev.value == 0 && 'hidden'}"><span>
        ${pricePrev.value} ${pricePrev.currency}
        ${pricePrev.vat ? '(' + pricePrev.vat + ')' : ''}<br>
        ${
          pricePrev.timestamp
            ? '@' + utils.formatDate(new Date(pricePrev.timestamp))
            : ''
        }
      </span></td>
      <td class="price-now ${priceNow.value == 0 && 'hidden'}"><span>
        ${priceNow.value} ${priceNow.currency}
        ${priceNow.vat ? '(' + priceNow.vat + ')' : ''}<br>
        @${utils.formatDate(new Date(priceNow.timestamp))}
      </span></td>
      <td class="price-changed highlight ${
        pricePrev.value == 0 && 'hidden'
      }"><span>
        ${priceDiff > 0 ? '升' : '降'} ${Math.abs(priceDiff).toFixed(2)}
        ${priceNow.currency}
      </span></td>
      <td class="operation">
        <a class="remove" href="#"
            data-id="${product.id}">取消监测</a>
      </td>
    </tr>`;
  });

  $list.innerHTML = html + '</tbody></table>';

  $list.querySelectorAll('.operation .remove').forEach(async ($op) => {
    $op.addEventListener('click', async (e) => {
      e.preventDefault();

      const id = $op.getAttribute('data-id');
      await storage.remove(id);

      $list.querySelector(`[data-id="${id}"]`).remove();
    });
  });
}
