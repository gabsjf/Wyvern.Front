import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { FichaComponent } from './ficha';

describe('FichaComponent', () => {
  let component: FichaComponent;
  let fixture: ComponentFixture<FichaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FichaComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(FichaComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
