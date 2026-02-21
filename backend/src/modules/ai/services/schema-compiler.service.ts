import { Injectable } from "@nestjs/common";
import { z } from "zod";
import type { SchemaDescriptor, SchemaField } from "../interfaces/schema.interface";

type CompiledShape = Record<string, z.ZodTypeAny>;

@Injectable()
export class SchemaCompilerService {
  compile(descriptor: SchemaDescriptor): z.ZodObject<CompiledShape> {
    this.assertValidDescriptor(descriptor);
    return this.compileObject(descriptor.fields);
  }

  serialize(schema: z.ZodObject<z.ZodRawShape>): SchemaDescriptor {
    const shape = schema.shape;
    const fields: Record<string, SchemaField> = {};

    for (const [key, fieldSchema] of Object.entries(shape)) {
      fields[key] = this.serializeField(fieldSchema as unknown as z.ZodTypeAny);
    }

    return {
      type: "object",
      fields,
    };
  }

  validate(input: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    this.validateDescriptor(input, "schema", errors);
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  extractFieldPaths(descriptor: SchemaDescriptor): string[] {
    const paths: string[] = [];
    this.collectPaths(descriptor.fields, "", paths);
    return paths;
  }

  private compileObject(fields: Record<string, SchemaField>): z.ZodObject<CompiledShape> {
    const shape: CompiledShape = {};
    for (const [key, field] of Object.entries(fields)) {
      shape[key] = this.compileField(field);
    }
    return z.object(shape);
  }

  private compileField(field: SchemaField): z.ZodTypeAny {
    let schema: z.ZodTypeAny;

    switch (field.type) {
      case "string":
        schema = z.string();
        break;
      case "number": {
        let numberSchema = z.number();
        if (typeof field.min === "number") {
          numberSchema = numberSchema.min(field.min);
        }
        if (typeof field.max === "number") {
          numberSchema = numberSchema.max(field.max);
        }
        schema = numberSchema;
        break;
      }
      case "boolean":
        schema = z.boolean();
        break;
      case "enum": {
        const values = field.values ?? [];
        schema = z.enum(values as [string, ...string[]]);
        break;
      }
      case "array":
        schema = z.array(this.compileField(field.items as SchemaField));
        break;
      case "object":
        schema = this.compileObject(field.fields ?? {});
        break;
      default:
        schema = z.unknown();
        break;
    }

    if (field.default !== undefined) {
      schema = schema.default(field.default);
    }

    if (field.optional) {
      schema = schema.optional();
    }

    return schema;
  }

  private serializeField(inputSchema: z.ZodTypeAny): SchemaField {
    const { schema, optional, defaultValue } = this.unwrapSchema(inputSchema);

    if (schema instanceof z.ZodString) {
      return this.withMeta({ type: "string" }, optional, defaultValue);
    }

    if (schema instanceof z.ZodNumber) {
      const checks = this.readChecks(schema);
      const minCheck = checks.find((check) => check.kind === "min");
      const maxCheck = checks.find((check) => check.kind === "max");

      return this.withMeta(
        {
          type: "number",
          min: minCheck?.value,
          max: maxCheck?.value,
        },
        optional,
        defaultValue,
      );
    }

    if (schema instanceof z.ZodBoolean) {
      return this.withMeta({ type: "boolean" }, optional, defaultValue);
    }

    if (schema instanceof z.ZodEnum) {
      return this.withMeta(
        {
          type: "enum",
          values: schema.options.map((value) => String(value)),
        },
        optional,
        defaultValue,
      );
    }

    if (schema instanceof z.ZodArray) {
      return this.withMeta(
        {
          type: "array",
          items: this.serializeField(schema.element as unknown as z.ZodTypeAny),
        },
        optional,
        defaultValue,
      );
    }

    if (schema instanceof z.ZodObject) {
      const nestedFields: Record<string, SchemaField> = {};
      for (const [key, value] of Object.entries(schema.shape)) {
        nestedFields[key] = this.serializeField(value as unknown as z.ZodTypeAny);
      }

      return this.withMeta(
        {
          type: "object",
          fields: nestedFields,
        },
        optional,
        defaultValue,
      );
    }

    return this.withMeta({ type: "string" }, optional, defaultValue);
  }

  private withMeta(
    field: SchemaField,
    optional: boolean,
    defaultValue: unknown,
  ): SchemaField {
    if (optional) {
      field.optional = true;
    }

    if (defaultValue !== undefined) {
      field.default = defaultValue;
    }

    return field;
  }

  private unwrapSchema(inputSchema: z.ZodTypeAny): {
    schema: z.ZodTypeAny;
    optional: boolean;
    defaultValue: unknown;
  } {
    let schema: unknown = inputSchema;
    let optional = false;
    let defaultValue: unknown = undefined;

    while (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
      if (schema instanceof z.ZodOptional) {
        optional = true;
        schema = schema.unwrap();
        continue;
      }

      defaultValue = this.getDefaultValue(schema);
      schema = this.getInnerDefaultSchema(schema);
    }

    return {
      schema: schema as z.ZodTypeAny,
      optional,
      defaultValue,
    };
  }

  private getDefaultValue(schema: unknown): unknown {
    const def = (schema as { _def?: { defaultValue?: unknown } })._def;
    const candidate = def?.defaultValue;
    if (typeof candidate === "function") {
      return (candidate as () => unknown)();
    }
    return candidate;
  }

  private getInnerDefaultSchema(schema: unknown): unknown {
    const def = (schema as { _def?: { innerType?: unknown } })._def;
    return def?.innerType ?? z.unknown();
  }

  private readChecks(schema: z.ZodNumber): Array<{ kind: string; value: number }> {
    const def = (schema as unknown as { _def?: { checks?: unknown[] } })._def;
    const checks = Array.isArray(def?.checks) ? def.checks : [];
    const parsed: Array<{ kind: string; value: number }> = [];

    for (const check of checks) {
      const kind = (check as { kind?: unknown }).kind;
      const value = (check as { value?: unknown }).value;
      if (typeof kind === "string" && typeof value === "number") {
        parsed.push({ kind, value });
      }
    }

    return parsed;
  }

  private collectPaths(
    fields: Record<string, SchemaField>,
    prefix: string,
    paths: string[],
  ): void {
    for (const [fieldKey, field] of Object.entries(fields)) {
      const path = prefix ? `${prefix}.${fieldKey}` : fieldKey;

      if (field.type === "object") {
        this.collectPaths(field.fields ?? {}, path, paths);
        continue;
      }

      if (field.type === "array") {
        const arrayPath = `${path}[]`;
        if (field.items?.type === "object") {
          this.collectPaths(field.items.fields ?? {}, arrayPath, paths);
        } else {
          paths.push(arrayPath);
        }
        continue;
      }

      paths.push(path);
    }
  }

  private assertValidDescriptor(descriptor: SchemaDescriptor): void {
    const validation = this.validate(descriptor);
    if (!validation.valid) {
      throw new Error(`Invalid schema descriptor: ${validation.errors.join("; ")}`);
    }
  }

  private validateDescriptor(input: unknown, path: string, errors: string[]): void {
    if (!input || typeof input !== "object") {
      errors.push(`${path} must be an object`);
      return;
    }

    const descriptor = input as Partial<SchemaDescriptor>;

    if (descriptor.type !== "object") {
      errors.push(`${path}.type must be object`);
    }

    if (!descriptor.fields || typeof descriptor.fields !== "object") {
      errors.push(`${path}.fields must be an object`);
      return;
    }

    for (const [fieldName, field] of Object.entries(descriptor.fields)) {
      this.validateField(field, `${path}.fields.${fieldName}`, errors);
    }
  }

  private validateField(input: unknown, path: string, errors: string[]): void {
    if (!input || typeof input !== "object") {
      errors.push(`${path} must be an object`);
      return;
    }

    const field = input as Partial<SchemaField>;
    const supportedTypes = new Set(["string", "number", "boolean", "array", "object", "enum"]);

    if (!field.type || !supportedTypes.has(field.type)) {
      errors.push(`${path}.type is invalid`);
      return;
    }

    if (field.type === "number") {
      if (field.min !== undefined && typeof field.min !== "number") {
        errors.push(`${path}.min must be a number`);
      }
      if (field.max !== undefined && typeof field.max !== "number") {
        errors.push(`${path}.max must be a number`);
      }
      if (
        typeof field.min === "number" &&
        typeof field.max === "number" &&
        field.min > field.max
      ) {
        errors.push(`${path}.min cannot be greater than max`);
      }
    }

    if (field.type === "array") {
      if (!field.items) {
        errors.push(`${path}.items is required for array`);
      } else {
        this.validateField(field.items, `${path}.items`, errors);
      }
    }

    if (field.type === "object") {
      if (!field.fields || typeof field.fields !== "object") {
        errors.push(`${path}.fields is required for object`);
      } else {
        for (const [childName, childField] of Object.entries(field.fields)) {
          this.validateField(childField, `${path}.fields.${childName}`, errors);
        }
      }
    }

    if (field.type === "enum") {
      if (!Array.isArray(field.values) || field.values.length === 0) {
        errors.push(`${path}.values must be a non-empty string array`);
      } else {
        for (const [index, value] of field.values.entries()) {
          if (typeof value !== "string" || value.length === 0) {
            errors.push(`${path}.values[${index}] must be a non-empty string`);
          }
        }
      }
    }
  }
}
