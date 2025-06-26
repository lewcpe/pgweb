export function transformToCamelCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(v => transformToCamelCase(v));
  } else if (obj !== null && obj.constructor === Object) {
    return Object.keys(obj).reduce((result, key) => {
      const camelCaseKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      result[camelCaseKey] = transformToCamelCase(obj[key]);
      return result;
    }, {} as any);
  }
  return obj;
}