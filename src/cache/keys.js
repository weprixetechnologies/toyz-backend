module.exports = {
  TTL: {
    PRODUCTS_LIST: 300,      // 5 minutes
    PRODUCT_DETAIL: 600,     // 10 minutes
    CATEGORIES_TREE: 3600,   // 1 hour
    OFFERS_ACTIVE: 600,      // 10 minutes
    SETTINGS_PUBLIC: 3600    // 1 hour
  },
  KEYS: {
    productsList: (queryStr = '') => `products:list:${queryStr}`,
    productDetail: (slug) => `products:detail:${slug}`,
    categoriesTree: () => `categories:tree`,
    offersActive: () => `offers:active`,
    settingsPublic: () => `settings:public`
  },
  PREFIXES: {
    products: 'products:*',
    categories: 'categories:*',
    offers: 'offers:*',
    settings: 'settings:*'
  }
};
