import {it,expect} from 'vitest';
import {ACCOUNT_OPERATIONS,OwnerAccessRequestSchema,OwnerAccessResponseSchema} from './index';
it('operator-only owner access has bounded strict password input and no secret response',()=>{
 const body={mode:'create',expectedVersion:1,email:'owner@example.com',password:'Example operator password',reason:'Actual operator provision'};
 expect(OwnerAccessRequestSchema.safeParse(body).success).toBe(true);
 for(const extra of [{emailVerified:true},{roles:['admin']},{consent:true},{accountId:'invented'}])expect(OwnerAccessRequestSchema.safeParse({...body,...extra}).success).toBe(false);
 expect(OwnerAccessRequestSchema.safeParse({...body,password:'short'}).success).toBe(false);
 expect(OwnerAccessRequestSchema.safeParse({...body,mode:'reset'}).success).toBe(true);
 expect(ACCOUNT_OPERATIONS.find(o=>o.id==='provisionOwnerAccess')).toMatchObject({access:'admin',permission:'owners:write',stepUp:true,csrf:true});
 expect(OwnerAccessResponseSchema.safeParse({data:{...body},meta:{}}).success).toBe(false);
});
