import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PersonController } from './person.controller';
import { PersonService } from './person.service';
import { Person } from './entities/person.entity';
import { RelationSp } from '../relation_sp/entities/relation_sp.entity';
import { NaskahSirkulasi } from 'src/modules/naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { OmPosition } from '../position/entities/om-position.entity';
import { OrgDataService } from '../org_data/org_data.service';

describe('PersonController', () => {
  let controller: PersonController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PersonController],
      providers: [
        PersonService,
        {
          provide: getRepositoryToken(Person),
          useValue: {},
        },
        {
          provide: getRepositoryToken(RelationSp),
          useValue: {},
        },
        {
          provide: getRepositoryToken(NaskahSirkulasi),
          useValue: {},
        },
        {
          provide: getRepositoryToken(OmPosition),
          useValue: {},
        },
        {
          provide: OrgDataService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<PersonController>(PersonController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
