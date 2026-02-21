export type SchemaFieldType =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "enum";

export interface SchemaField {
  type: SchemaFieldType;
  description?: string;
  optional?: boolean;
  min?: number;
  max?: number;
  default?: unknown;
  items?: SchemaField;
  fields?: Record<string, SchemaField>;
  values?: string[];
}

export interface SchemaDescriptor {
  type: "object";
  fields: Record<string, SchemaField>;
}
