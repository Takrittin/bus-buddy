import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { verifyPassword } from '../users/password.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async register(registerDto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email already exists.');
    }

    const user = await this.usersService.create({
      email: registerDto.email,
      name: registerDto.name,
      role: registerDto.role,
      password: registerDto.password,
    });

    return {
      user,
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
      include: {
        favoriteStops: true,
        subscriptions: true,
      },
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const isValidPassword = await verifyPassword(
      loginDto.password,
      user.passwordHash,
    );

    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const { passwordHash: _passwordHash, ...safeUser } = user;

    return {
      user: safeUser,
    };
  }
}
