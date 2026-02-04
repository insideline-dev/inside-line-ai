import { CreateThesis, CreateThesisDto } from './create-thesis.dto';

// Upsert pattern - same as create
export type UpdateThesis = CreateThesis;
export class UpdateThesisDto extends CreateThesisDto {}
