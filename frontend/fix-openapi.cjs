const fs = require('fs');
const spec = JSON.parse(fs.readFileSync('./openapi.json', 'utf8'));

// Fix OpenAPI 3.0 compatibility issues
function fixSchema(obj, parentKey = '') {
  if (!obj || typeof obj !== 'object') return;
  
  if (Array.isArray(obj)) {
    obj.forEach(item => fixSchema(item, parentKey));
    return;
  }
  
  // Fix exclusiveMinimum - in 3.0, should be boolean, in 3.1 it's a number
  if (typeof obj.exclusiveMinimum === 'number') {
    obj.minimum = obj.exclusiveMinimum;
    obj.exclusiveMinimum = true;
  }
  if (typeof obj.exclusiveMaximum === 'number') {
    obj.maximum = obj.exclusiveMaximum;
    obj.exclusiveMaximum = true;
  }
  
  // Fix empty additionalProperties - should be true or have type
  if (obj.additionalProperties !== undefined && 
      typeof obj.additionalProperties === 'object' && 
      Object.keys(obj.additionalProperties).length === 0) {
    obj.additionalProperties = true;
  }
  
  // Remove propertyNames (not well supported in OpenAPI 3.0)
  if (obj.propertyNames !== undefined) {
    delete obj.propertyNames;
  }
  
  for (const key in obj) {
    fixSchema(obj[key], key);
  }
}

fixSchema(spec);
fs.writeFileSync('./openapi.json', JSON.stringify(spec, null, 2));
console.log('Fixed OpenAPI spec');
