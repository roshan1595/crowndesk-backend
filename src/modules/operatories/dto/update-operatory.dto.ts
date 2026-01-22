import { PartialType } from '@nestjs/swagger';
import { CreateOperatoryDto } from './create-operatory.dto';

export class UpdateOperatoryDto extends PartialType(CreateOperatoryDto) {}
