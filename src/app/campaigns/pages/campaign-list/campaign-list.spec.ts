import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CampaignList } from './campaign-list';

describe('CampaignList', () => {
  let component: CampaignList;
  let fixture: ComponentFixture<CampaignList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CampaignList],
    }).compileComponents();

    fixture = TestBed.createComponent(CampaignList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
