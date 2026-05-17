# Solidity Project with Hardhat

이 프로젝트는 Solidity 스마트 컨트랙트 개발을 위한 기본 환경입니다.

## 시작하기

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 변수 설정
`.env.example` 파일을 복사하여 `.env` 파일을 생성하고 필요한 값을 입력하세요.
```bash
cp .env.example .env
```

### 3. 컴파일
```bash
npx hardhat compile
```

### 4. 테스트 실행
```bash
npx hardhat test
```

### 5. 로컬 네트워크 배포
```bash
# 로컬 노드 실행
npx hardhat node

# 배포 스크립트 실행
npx hardhat run scripts/deploy.js --network localhost
```

## 프로젝트 구조
- `contracts/`: Solidity 스마트 컨트랙트 소스 코드
- `test/`: 컨트랙트 테스트 파일 (Mocha/Chai)
- `scripts/`: 배포 및 유틸리티 스크립트
- `hardhat.config.js`: Hardhat 프로젝트 설정
- `.prettierrc`: Solidity 및 JavaScript 코드 포맷팅 설정
