import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CampaignCreate } from './campaign-create';

describe('CampaignCreate', () => {
  let component: CampaignCreate;
  let fixture: ComponentFixture<CampaignCreate>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CampaignCreate],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CampaignCreate);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
