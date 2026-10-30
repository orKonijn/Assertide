export const products = [
  { name: 'Sauce Labs Bike Light', slug: 'sauce-labs-bike-light', cents: 999 },
  { name: 'Sauce Labs Bolt T-Shirt', slug: 'sauce-labs-bolt-t-shirt', cents: 1599 },
  { name: 'Sauce Labs Onesie', slug: 'sauce-labs-onesie', cents: 799 },
  {
    name: 'Test.allTheThings() T-Shirt (Red)',
    slug: 'test.allthethings()-t-shirt-(red)',
    cents: 1599,
  },
  { name: 'Sauce Labs Backpack', slug: 'sauce-labs-backpack', cents: 2999 },
  { name: 'Sauce Labs Fleece Jacket', slug: 'sauce-labs-fleece-jacket', cents: 4999 },
] as const;
export const baskets = [
  { name: 'lowest-price pair', indexes: [0, 2] },
  { name: 'highest-price pair', indexes: [4, 5] },
  { name: 'equal-price shirts with accessory', indexes: [1, 3, 0] },
  { name: 'four-item mixed basket', indexes: [0, 1, 2, 4] },
  { name: 'five-item basket', indexes: [0, 1, 2, 3, 5] },
  { name: 'complete six-item catalog', indexes: [0, 1, 2, 3, 4, 5] },
] as const;
