const STORAGE_KEY_PRODUCTS = 'products';

export async function save(product) {
  if (!product) {
    return false;
  }

  const products = await all();
  const oldProduct = products[product.id];

  let changed = false;
  if (!oldProduct) {
    products[product.id] = product;
    product.priceHistory = [];
  } else {
    if (
      product.priceNow.value != oldProduct.priceNow.value ||
      product.priceNow.currency != oldProduct.priceNow.currency
    ) {
      changed = true;
      products[product.id] = {
        ...product,
        priceHistory: [oldProduct.priceNow].concat(oldProduct.priceHistory)
      };
    }
  }

  await chrome.storage.local.set({ [STORAGE_KEY_PRODUCTS]: products });

  return changed;
}

export async function remove(id) {
  const products = await all();

  delete products[id];

  await chrome.storage.local.set({ [STORAGE_KEY_PRODUCTS]: products });
}

export async function get(id) {
  const products = await all();

  return products[id];
}

export async function has(id) {
  return !!(await get(id));
}

export async function all() {
  return (
    ((await chrome.storage.local.get(STORAGE_KEY_PRODUCTS)) || {})[
      STORAGE_KEY_PRODUCTS
    ] || {}
  );
}
