const bcrypt = require('bcryptjs');

// 데이터베이스에 저장된 해시와 비밀번호 확인
const password = 'admin123!';
const dbHash = '$2a$12$vZ8j9XJ5k.L2N3Q4R5S6T.uV7wX8yA9bB0cC1dD2eE3fF4gG5hH6i';
const correctHash = '$2a$12$s/59vJKpEJkiYHvCakOe1Ocoo/hLFvPeOP673JBo1Xq9vscPyEHgW';

async function verifyHashes() {
    console.log('Password to verify:', password);
    console.log('DB Hash:', dbHash);
    console.log('Correct Hash:', correctHash);

    const dbHashValid = await bcrypt.compare(password, dbHash);
    const correctHashValid = await bcrypt.compare(password, correctHash);

    console.log('\n=== Results ===');
    console.log('DB Hash matches password:', dbHashValid);
    console.log('Correct Hash matches password:', correctHashValid);

    if (!dbHashValid) {
        console.log('\n⚠️ Database hash does NOT match the password!');
        console.log('You need to update the database with the correct hash.');
    } else {
        console.log('\n✅ Database hash is correct!');
    }
}

verifyHashes().catch(console.error);