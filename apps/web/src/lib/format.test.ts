import { describe, expect, it } from 'vitest';
import { readCoordinates, readCategory, safePhone, safeWebsite, distance, duration } from './format';
describe('visitor input and contact safety',()=>{
  it.each(['lon=&lat=54','lon=32x&lat=54','lon=181&lat=54','lon=32&lat=91','lat=54','lon=32&lon=33&lat=54'])('does not convert malformed coordinates into a search point: %s',query=>{expect(readCoordinates(new URLSearchParams(query))).toBeNull();});
  it('keeps lon/lat order and accepts zero coordinates',()=>{expect(readCoordinates(new URLSearchParams('lon=32.05&lat=54.78'))).toEqual({lon:32.05,lat:54.78});expect(readCoordinates(new URLSearchParams('lon=0&lat=0'))).toEqual({lon:0,lat:0});});
  it('allows only defined categories',()=>{expect(readCategory('cafe')).toBe('cafe');expect(readCategory('script')).toBe('');});
  it.each(['javascript:alert(1)','data:text/html,test','https://user:password@example.com','file:///etc/passwd'])('rejects unsafe website %s',url=>{expect(safeWebsite(url)).toBeNull();});
  it('formats allowed contacts without executable URLs',()=>{expect(safeWebsite('https://example.com/')).toBe('https://example.com/');expect(safePhone('+7 (4812) 12-34-56')).toBe('tel:+74812123456');expect(safePhone('javascript:alert(1)')).toBeNull();});
  it('formats API measurements in metres and seconds',()=>{expect(distance(520)).toBe('520 м');expect(distance(1250)).toBe('1.3 км');expect(duration(121)).toBe('2 мин');});
});
