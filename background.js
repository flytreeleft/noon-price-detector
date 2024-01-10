import * as storage from './lib/storage/products.js';
import * as utils from './lib/utils.js';

const MENU_ADD = 'product-add';
const MENU_REMOVE = 'product-remove';
const ALARM_PRODUCT_PRICE_CHANGED = 'product-price-changed-alarm';
const NOTIFY_PRODUCT_PRICE_CHANGED = 'product-price-changed-notify';
const NOTIFY_PRODUCT_PRICE_DETECTING = 'product-price-detecting-notify';

chrome.runtime.onInstalled.addListener(async () => {
  chrome.notifications.create('running-notify', {
    type: 'basic',
    iconUrl: './logo-48.png',
    title: 'Noon 商品价格监测器',
    message: 'Noon 商品价格监测提醒运行中...'
  });

  // 启动定时器
  await chrome.alarms.create(ALARM_PRODUCT_PRICE_CHANGED, {
    delayInMinutes: 1
  });
});

// 为激活标签创建菜单
chrome.tabs.onUpdated.addListener(
  async (tabId, { url }) => await updateContextMeunByTab(tabId, url)
);
chrome.tabs.onActivated.addListener(
  async ({ tabId }) => await updateContextMeunByTab(tabId)
);

// 监听右键菜单点击事件
chrome.contextMenus.onClicked.addListener(async ({ menuItemId, pageUrl }) => {
  // https://developer.chrome.com/docs/extensions/reference/api/contextMenus
  const product = await fetchProduct(pageUrl);

  switch (menuItemId) {
    case MENU_ADD:
      await storage.save(product);
      showContextMenu(true);

      notifyPriceDetecting(product, false);
      break;
    case MENU_REMOVE:
      await storage.remove(product.id);
      showContextMenu(false);

      notifyPriceDetecting(product, true);
      break;
  }
});

// 周期探测商品价格变化
chrome.alarms.onAlarm.addListener(async () => {
  try {
    const products = await storage.all();

    const newProducts = await Promise.all(
      Object.keys(products)
        .map((id) => products[id])
        .map((product) => fetchProduct(product.url))
    );

    const changes = [];
    // Note：不能同时异步存储多条数据，否则，只有第一条数据能够被保存，
    // 其他数据会因为未读写同步导致获取的全量数据不是前一次更新后的数据
    for (let newProduct of newProducts) {
      const changed = await storage.save(newProduct);
      if (changed) {
        changes.push({ new: newProduct, old: products[newProduct.id] });
      }
    }

    if (changes.length > 0) {
      changes.forEach(notifyPriceChanged);
    } else {
      console.info(utils.formatDate(new Date()), '未监测到有价格变动的商品');
    }

    reloadOptionsPage();
  } catch (e) {
    // 不能中断定时任务
    console.error(e);
  }

  const delay = getRandomInt(1, 5);
  console.info(`在 ${delay} 分钟后继续下一次的价格检查`);

  await chrome.alarms.create(ALARM_PRODUCT_PRICE_CHANGED, {
    delayInMinutes: delay
  });
});

chrome.notifications.onButtonClicked.addListener(
  async (notificationId, btn) => {
    const [notificationCode, productId] = notificationId.split(':');

    chrome.notifications.clear(notificationId);
    if (btn != 0) {
      return;
    }

    switch (notificationCode) {
      case NOTIFY_PRODUCT_PRICE_CHANGED: {
        const product = await storage.get(productId);

        if (product) {
          chrome.tabs.create({
            url: product.url
          });
        }
        break;
      }
      case NOTIFY_PRODUCT_PRICE_DETECTING: {
        await chrome.runtime.openOptionsPage();
        break;
      }
    }
  }
);

function getRandomInt(min, max) {
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random#getting_a_random_integer_between_two_values
  min = Math.ceil(min);
  max = Math.floor(max);

  return Math.floor(Math.random() * (max - min) + min);
}

async function updateContextMeunByTab(tabId, url) {
  const tab = !url ? await chrome.tabs.get(tabId) : { url };
  const productId =
    isMatchedURL(tab.url) &&
    tab.url.replaceAll(/.+\/([^\/]+)\/p\/.*/g, '$1').toLowerCase(); //await fetchProduct(tab.url);

  if (!productId) {
    showContextMenu(false, true);
  } else {
    const exist = await storage.has(productId);
    showContextMenu(exist);
  }
}

function isMatchedURL(url) {
  return /^https:\/\/[^\/]+\.noon\.com\/.+$/g.test(url);
}

async function fetchProduct(pageURL) {
  if (!isMatchedURL(pageURL)) {
    return;
  }

  const apiURL = pageURL.replaceAll(
    /(\/\/[^\/]+)\/[^\/]+/g,
    '$1/_svc/catalog/api/v3/u'
  );

  // 必须回传 x-locale，否则，获取的价格不是页面上最终显示的。但可传任意值
  const api = await fetch(apiURL, {
    headers: {
      'x-locale': 'en-sa'
    }
  }).then((resp) => resp.json());

  if (!api.product || !api.product.context) {
    return;
  }

  const id = api.product.context.skuConfig || '';
  const name = api.product.product_title;
  const price = api.product.context.price || 0;
  const images = (api.product.image_keys || []).map(
    (key) => `https://f.nooncdn.com/p/${key}.jpg`
  );

  // api.product.variants.forEach((variant) => {
  //   variant.offers.forEach((offer) => {
  //     console.log(offer.offer_code, offer.price, offer.sale_price);
  //   });
  // });

  return {
    id: id.toLowerCase(),
    name,
    url: pageURL,
    images,
    priceNow: {
      value: price,
      currency: 'SAR',
      timestamp: new Date().getTime()
    }
  };
}

async function reloadOptionsPage() {
  const manifest = chrome.runtime.getManifest();
  const page = (manifest.options_ui || {}).page || manifest.options_page;
  if (!page) {
    return;
  }

  const url = chrome.runtime.getURL(page);
  const tabs = await chrome.tabs.query({ url });
  if (tabs && tabs.length > 0) {
    for (let tab of tabs) {
      await chrome.tabs.reload(tab.id);
    }
  }
}

function showContextMenu(exist, hideAll) {
  chrome.contextMenus.removeAll();

  if (hideAll) {
    return;
  }

  if (exist) {
    chrome.contextMenus.create({
      id: MENU_REMOVE,
      title: '不再监测该商品的价格变动',
      contexts: ['page']
    });
  } else {
    chrome.contextMenus.create({
      id: MENU_ADD,
      title: '监测该商品的价格变动',
      contexts: ['page']
    });
  }
}

function notifyPriceChanged(changed) {
  // https://developer.chrome.com/docs/extensions/mv2/reference/notifications#type-NotificationItem
  chrome.notifications.create(
    NOTIFY_PRODUCT_PRICE_CHANGED + `:${changed.new.id}`,
    {
      type: 'basic',
      iconUrl: './logo-48.png',
      requireInteraction: true,
      buttons: [
        {
          title: '查看'
        },
        {
          title: '知道了'
        }
      ],
      title: 'Noon 商品价格监测提醒',
      message: `监测到商品【${changed.new.name}】的价格发生了变化，请及时查看：
原价 - ${changed.old.priceNow.value} ${changed.old.priceNow.currency}
现价 - ${changed.new.priceNow.value} ${changed.new.priceNow.currency}
      `
    }
  );
}

function notifyPriceDetecting(product, removed) {
  chrome.notifications.create(NOTIFY_PRODUCT_PRICE_DETECTING, {
    type: 'basic',
    iconUrl: './logo-48.png',
    buttons: [{ title: '查看' }],
    title: 'Noon 商品价格监测提醒',
    message: `商品【${product.name}】已${removed ? '取消' : '加入'}监测`
  });

  reloadOptionsPage();
}
