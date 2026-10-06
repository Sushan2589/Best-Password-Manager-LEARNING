//generateVerificationToken()
//hashVerificationToken()  
import crypto from "node:crypto"; 

export const generateVerificationToken = (byteSize = 32) => {
  return crypto.randomBytes(byteSize).toString('hex');
};

export const hashVerificationToken = (token: string) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};
